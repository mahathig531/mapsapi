from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import cv2
import numpy as np
from io import BytesIO
from shapely.geometry import Polygon, mapping
import tempfile
import os
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or ["http://localhost:3000"] for more security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_API_KEY = "AIzaSyCg1odmQXjofi1mstjxPNMTD8PRmbEx6Q0"  # Replace with your actual key or load from env
ATTOM_API_KEY = "c778e665beaf34700ca9efa17d2f2551"

def lat_lng_to_pixel(lat, lng, center_lat, center_lng, zoom, size=600):
    scale = 2 ** zoom
    def lat_to_y(lat):
        return (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * 256 * scale
    def lng_to_x(lng):
        return (lng + 180) / 360 * 256 * scale
    center_x = lng_to_x(center_lng)
    center_y = lat_to_y(center_lat)
    x = lng_to_x(lng)
    y = lat_to_y(lat)
    pixel_x = int(size // 2 + (x - center_x))
    pixel_y = int(size // 2 + (y - center_y))
    return pixel_x, pixel_y

# Helper for Google Geocoding
async def get_google_geocode(address):
    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={GOOGLE_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        data = resp.json()
        if data["status"] == "OK" and data["results"]:
            result = data["results"][0]
            return {
                "formatted_address": result["formatted_address"],
                "lat": result["geometry"]["location"]["lat"],
                "lng": result["geometry"]["location"]["lng"]
            }
        else:
            return None

# Helper for Attom Property API (address validation)
async def get_attom_property(address):
    url = f"https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/address?address={address}"
    headers = {"apikey": ATTOM_API_KEY}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        data = resp.json()
        # Parse Attom response for matched address and property data
        if "property" in data and data["property"]:
            prop = data["property"][0]
            matched_address = prop.get("address", {}).get("oneLine")
            return {
                "matched_address": matched_address,
                "property_data": prop
            }
        else:
            return None

# Helper to overlay property boundary on image
# boundary_coords: list of (lat, lng) tuples
# img: numpy array, size: (h, w, 3)
def overlay_boundary(img, boundary_coords, lat, lng, zoom, size=600):
    if not boundary_coords:
        return img
    pts = []
    for coord in boundary_coords:
        px, py = lat_lng_to_pixel(coord[0], coord[1], lat, lng, zoom, size)
        pts.append([px, py])
    pts = np.array([pts], dtype=np.int32)
    cv2.polylines(img, pts, isClosed=True, color=(0,255,0), thickness=3)
    return img

def calculate_heading(pano_lat, pano_lng, target_lat, target_lng):
    d_lon = math.radians(target_lng - pano_lng)
    y = math.sin(d_lon) * math.cos(math.radians(target_lat))
    x = (math.cos(math.radians(pano_lat)) * math.sin(math.radians(target_lat)) -
         math.sin(math.radians(pano_lat)) * math.cos(math.radians(target_lat)) * math.cos(d_lon))
    heading = math.degrees(math.atan2(y, x))
    return (heading + 360) % 360

def get_centroid(boundary):
    lats = [pt[0] for pt in boundary]
    lngs = [pt[1] for pt in boundary]
    return sum(lats)/len(lats), sum(lngs)/len(lngs)

async def get_streetview_pano(lat, lng):
    url = f"https://maps.googleapis.com/maps/api/streetview/metadata?location={lat},{lng}&key={GOOGLE_API_KEY}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        data = resp.json()
        if data.get('status') == 'OK':
            return data['location']['lat'], data['location']['lng']
        return None, None

@app.post("/geocode")
async def geocode_address(request: Request):
    data = await request.json()
    address = data.get("address")
    if not address:
        raise HTTPException(status_code=400, detail="Address required")
    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={address}&key={GOOGLE_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        return JSONResponse(content=resp.json())

@app.post("/verify_address")
async def verify_address(request: Request):
    data = await request.json()
    user_address = data.get("address")
    if not user_address:
        raise HTTPException(status_code=400, detail="Address required")
    google_info = await get_google_geocode(user_address)
    attom_info = await get_attom_property(user_address)
    if not google_info or not attom_info:
        return JSONResponse(content={"error": "Address not found in one or both services."}, status_code=404)
    return {
        "google_address": google_info["formatted_address"],
        "attom_address": attom_info["matched_address"],
        "property_data": attom_info["property_data"],
        "lat": google_info["lat"],
        "lng": google_info["lng"]
    }

@app.post("/capture")
async def capture_map(request: Request):
    data = await request.json()
    lat = data.get("lat")
    lng = data.get("lng")
    zoom = data.get("zoom", 16)
    hotspots = data.get("hotspots", [])
    view_type = data.get("view_type", "roadmap")  # roadmap, satellite, streetview
    size = 600

    if view_type in ["roadmap", "satellite"]:
        map_url = (
            f"https://maps.googleapis.com/maps/api/staticmap?"
            f"center={lat},{lng}&zoom={zoom}&size={size}x{size}"
            f"&maptype={view_type}&key={GOOGLE_API_KEY}"
        )
        async with httpx.AsyncClient() as client:
            resp = await client.get(map_url)
            img = np.array(bytearray(resp.content), dtype=np.uint8)
            img = cv2.imdecode(img, cv2.IMREAD_COLOR)
            # Annotate hotspots
            for hotspot in hotspots:
                px, py = lat_lng_to_pixel(hotspot['lat'], hotspot['lng'], lat, lng, zoom, size)
                px = max(0, min(px, size-1))
                py = max(0, min(py, size-1))
                cv2.circle(img, (px, py), 10, (0, 0, 255), -1)
                cv2.putText(img, hotspot['label'], (px + 12, py), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            _, buffer = cv2.imencode('.jpg', img)
            return StreamingResponse(BytesIO(buffer.tobytes()), media_type="image/jpeg")
    elif view_type == "streetview":
        map_url = (
            f"https://maps.googleapis.com/maps/api/streetview?"
            f"size={size}x{size}&location={lat},{lng}&fov=90&heading=235&pitch=10"
            f"&key={GOOGLE_API_KEY}"
        )
        async with httpx.AsyncClient() as client:
            resp = await client.get(map_url)
            return StreamingResponse(BytesIO(resp.content), media_type="image/jpeg")
    else:
        raise HTTPException(status_code=400, detail="Invalid view_type")

@app.post("/preview_map")
async def preview_map(request: Request):
    data = await request.json()
    lat = data.get("lat")
    lng = data.get("lng")
    zoom = data.get("zoom", 21)
    view_type = data.get("view_type", "satellite")
    boundary = data.get("boundary", None)  # list of [lat, lng]
    size = 600
    map_url = (
        f"https://maps.googleapis.com/maps/api/staticmap?"
        f"center={lat},{lng}&zoom={zoom}&size={size}x{size}&maptype={view_type}&key={GOOGLE_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(map_url)
        img = np.array(bytearray(resp.content), dtype=np.uint8)
        img = cv2.imdecode(img, cv2.IMREAD_COLOR)
        if boundary:
            img = overlay_boundary(img, boundary, lat, lng, zoom, size)
        _, buffer = cv2.imencode('.jpg', img)
        return StreamingResponse(BytesIO(buffer.tobytes()), media_type="image/jpeg")

@app.post("/preview_streetview")
async def preview_streetview(request: Request):
    data = await request.json()
    lat = data.get("lat")
    lng = data.get("lng")
    heading = data.get("heading", 0)
    pitch = data.get("pitch", 0)
    fov = data.get("fov", 80)
    size = 600
    streetview_url = (
        f"https://maps.googleapis.com/maps/api/streetview?size={size}x{size}&location={lat},{lng}"
        f"&fov={fov}&heading={heading}&pitch={pitch}&key={GOOGLE_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(streetview_url)
        return StreamingResponse(BytesIO(resp.content), media_type="image/jpeg")

@app.post("/auto_streetview")
async def auto_streetview(request: Request):
    data = await request.json()
    boundary = data.get("boundary", None)
    if not boundary:
        return JSONResponse(content={"error": "No property boundary provided."}, status_code=400)
    centroid_lat, centroid_lng = get_centroid(boundary)
    pano_lat, pano_lng = await get_streetview_pano(centroid_lat, centroid_lng)
    if pano_lat is None or pano_lng is None:
        return JSONResponse(content={"error": "No street view panorama found."}, status_code=404)
    heading = calculate_heading(pano_lat, pano_lng, centroid_lat, centroid_lng)
    size = 600
    streetview_url = (
        f"https://maps.googleapis.com/maps/api/streetview?size={size}x{size}&location={pano_lat},{pano_lng}"
        f"&fov=80&heading={heading}&pitch=0&key={GOOGLE_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(streetview_url)
        return StreamingResponse(BytesIO(resp.content), media_type="image/jpeg") 