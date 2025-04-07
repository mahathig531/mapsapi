from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import requests
import cv2
import numpy as np
from io import BytesIO
import math

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"], 
                             "methods": ["GET", "POST", "OPTIONS"], 
                             "allow_headers": ["Content-Type", "Authorization"]}}, supports_credentials=True)


# function to convert latitude and longitude to pixel coordinates
def lat_lng_to_pixel(lat, lng, center_lat, center_lng, zoom):
    scale = 2 ** zoom  
    # World coordinate calculations
    def lat_to_y(lat):
        return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 256 * scale

    def lng_to_x(lng):
        return (lng + 180) / 360 * 256 * scale

    center_x = lng_to_x(center_lng)
    center_y = lat_to_y(center_lat)

    x = lng_to_x(lng)
    y = lat_to_y(lat)

    # Calculate pixel positions relative to the image center (300, 300)
    pixel_x = int(300 + (x - center_x))
    pixel_y = int(300 + (y - center_y))

    return pixel_x, pixel_y

@app.route('/capture', methods=['POST'])
def capture_map():
    try:
        data = request.get_json()
        print("Received Data:", data)  
        
        lat, lng, zoom = data['lat'], data['lng'], data['zoom']
        hotspots = data.get('hotspots', [])
        
        print(f"Latitude: {lat}, Longitude: {lng}, Zoom: {zoom}")
        print("Hotspots:", hotspots)

        # Proceed with the existing logic
        map_url = (
            f"https://maps.googleapis.com/maps/api/staticmap?center={lat},{lng}&zoom={zoom}&size=600x600&key=AIzaSyCg1odmQXjofi1mstjxPNMTD8PRmbEx6Q0"
        )
        response = requests.get(map_url)

        if response.status_code != 200:
            print("Error fetching map image:", response.status_code)
            return jsonify({'error': 'Failed to retrieve map image'}), 500

        # Load image from response
        img = np.array(bytearray(response.content), dtype=np.uint8)
        img = cv2.imdecode(img, cv2.IMREAD_COLOR)

        if img is None:
            print("Error: Image loading failed")
            return jsonify({'error': 'Image loading failed'}), 500

        # Annotate hotspots
        for hotspot in hotspots:
            print(f"Annotating hotspot: {hotspot}")
            px, py = lat_lng_to_pixel(hotspot['lat'], hotspot['lng'], lat, lng, zoom)
            px = max(0, min(px, 599))
            py = max(0, min(py, 599))
            cv2.circle(img, (px, py), 10, (0, 0, 255), -1)
            cv2.putText(img, hotspot['label'], (px + 12, py), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # Convert image to JPEG
        success, buffer = cv2.imencode('.jpg', img)
        if not success:
            print("Error: Image encoding failed")
            return jsonify({'error': 'Image encoding failed'}), 500

        return send_file(BytesIO(buffer.tobytes()), mimetype='image/jpeg', as_attachment=True, attachment_filename='map_capture.jpg')

    except Exception as e:
        print("Server Error:", str(e))
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
