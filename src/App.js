import React, { useState, useCallback } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

// Map container styling
const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

// Default map center (Toronto)
const center = {
  lat: 43.65107,
  lng: -79.347015
};

function App() {
  const [mapCenter, setMapCenter] = useState(center);
  const [mapZoom, setMapZoom] = useState(12); 
  const [location, setLocation] = useState("");
  const [hotspots, setHotspots] = useState([]);
  const [viewType, setViewType] = useState("roadmap");
  const [googleAddress, setGoogleAddress] = useState("");
  const [attomAddress, setAttomAddress] = useState("");
  const [propertyData, setPropertyData] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // For previews
  const [satZoom, setSatZoom] = useState(21);
  const [roadZoom, setRoadZoom] = useState(21);
  const [streetHeading, setStreetHeading] = useState(0);
  const [streetFov, setStreetFov] = useState(80);
  const [streetPitch, setStreetPitch] = useState(0);
  const [satPreview, setSatPreview] = useState(null);
  const [roadPreview, setRoadPreview] = useState(null);
  const [streetPreview, setStreetPreview] = useState(null);

  // Auto front door street view
  const [autoStreetPreview, setAutoStreetPreview] = useState(null);

  // Address verification using FastAPI backend
  const verifyAddress = async () => {
    setConfirmed(false);
    setShowConfirm(false);
    setGoogleAddress("");
    setAttomAddress("");
    setPropertyData(null);
    setSatPreview(null);
    setRoadPreview(null);
    setStreetPreview(null);
    setAutoStreetPreview(null);
    try {
      const response = await fetch('http://localhost:8000/verify_address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: location })
      });
      const data = await response.json();
      if (response.ok && data.attom_address) {
        setGoogleAddress(data.google_address);
        setAttomAddress(data.attom_address);
        setPropertyData(data.property_data);
        setMapCenter({ lat: data.lat, lng: data.lng });
        setMapZoom(18);
        setShowConfirm(true);
        setSatZoom(21);
        setRoadZoom(21);
        setStreetHeading(0);
        setStreetFov(80);
        setStreetPitch(0);
      } else {
        alert("Address not found or could not be verified.");
      }
    } catch (error) {
      console.error("Error verifying address:", error);
      alert("Failed to verify address.");
    }
  };

  // Handle map click to add a hotspot
  const addHotspot = useCallback((event) => {
    if (!confirmed) return;
    const label = prompt("Enter hotspot label:");
    if (label) {
      const newHotspot = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
        label: label
      };
      setHotspots((prev) => [...prev, newHotspot]);
    }
  }, [confirmed]);

  // Helper to extract property boundary as [[lat, lng], ...]
  const getBoundary = () => {
    if (propertyData && propertyData.boundary && propertyData.boundary.polygon) {
      // Attom returns a string: "lat1 lng1,lat2 lng2,..."
      return propertyData.boundary.polygon.split(',').map(pair => {
        const [lat, lng] = pair.trim().split(' ');
        return [parseFloat(lat), parseFloat(lng)];
      });
    }
    return null;
  };

  // Fetch preview images
  const fetchPreview = async (type) => {
    if (!confirmed) return;
    const lat = mapCenter.lat, lng = mapCenter.lng;
    const boundary = getBoundary();
    if (type === 'satellite') {
      const resp = await fetch('http://localhost:8000/preview_map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, zoom: satZoom, view_type: 'satellite', boundary })
      });
      setSatPreview(URL.createObjectURL(await resp.blob()));
    } else if (type === 'roadmap') {
      const resp = await fetch('http://localhost:8000/preview_map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, zoom: roadZoom, view_type: 'roadmap', boundary })
      });
      setRoadPreview(URL.createObjectURL(await resp.blob()));
    } else if (type === 'streetview') {
      const resp = await fetch('http://localhost:8000/preview_streetview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, heading: streetHeading, fov: streetFov, pitch: streetPitch })
      });
      setStreetPreview(URL.createObjectURL(await resp.blob()));
    }
  };

  // Fetch auto front door street view
  const fetchAutoStreetView = async () => {
    if (!confirmed) return;
    const boundary = getBoundary();
    if (!boundary) {
      alert('No property boundary available for auto street view.');
      return;
    }
    const resp = await fetch('http://localhost:8000/auto_streetview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boundary })
    });
    if (resp.ok) {
      setAutoStreetPreview(URL.createObjectURL(await resp.blob()));
    } else {
      alert('No street view panorama found for this property.');
    }
  };

  // Download preview image
  const downloadPreview = (url, name) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Capture the map view along with hotspots
  const captureMap = async () => {
    try {
      const response = await fetch('http://localhost:8000/capture', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'image/jpeg'
        },
        body: JSON.stringify({ 
          lat: mapCenter.lat, 
          lng: mapCenter.lng, 
          zoom: mapZoom, 
          hotspots,
          view_type: viewType
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to capture map');
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Received empty image');
      }

      const imageURL = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = imageURL;
      link.download = `map_capture_${viewType}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(imageURL);
    } catch (error) {
      console.error("Error capturing map:", error);
      alert(`Failed to capture map: ${error.message}`);
    }
  };

  // Confirm or reject Attom-corrected address
  const handleConfirm = (isConfirmed) => {
    setConfirmed(isConfirmed);
    setShowConfirm(false);
    if (!isConfirmed) {
      setGoogleAddress("");
      setAttomAddress("");
      setPropertyData(null);
      setHotspots([]);
      setMapCenter(center);
      setMapZoom(12);
      setLocation("");
      setSatPreview(null);
      setRoadPreview(null);
      setStreetPreview(null);
      setAutoStreetPreview(null);
    }
  };

  return (
    <div className="App">
      <h2>Google Maps Hotspot Creator</h2>
      <input
        type="text"
        placeholder="Enter location..."
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        style={{ marginBottom: "5px", padding: "5px" }}
        disabled={confirmed}
      />
      <button onClick={verifyAddress} style={{ marginLeft: "5px", padding: "5px" }} disabled={confirmed || !location}>
        Verify Address
      </button>
      <button onClick={() => fetchPreview('satellite')} disabled={!confirmed} style={{ marginLeft: "5px" }}>Preview Satellite</button>
      <button onClick={() => fetchPreview('roadmap')} disabled={!confirmed} style={{ marginLeft: "5px" }}>Preview Aerial</button>
      <button onClick={() => fetchPreview('streetview')} disabled={!confirmed} style={{ marginLeft: "5px" }}>Preview Street View</button>
      <button onClick={fetchAutoStreetView} disabled={!confirmed} style={{ marginLeft: "5px" }}>Auto Front Door Street View</button>
      <div style={{ marginTop: 20, display: 'flex', gap: 20 }}>
        {satPreview && (
          <div>
            <div>Satellite View (Zoom: {satZoom})</div>
            <input type="range" min={18} max={21} value={satZoom} onChange={e => setSatZoom(Number(e.target.value))} onMouseUp={() => fetchPreview('satellite')} />
            <img src={satPreview} alt="Satellite Preview" style={{ width: 300, height: 300, display: 'block', marginTop: 5 }} />
            <button onClick={() => downloadPreview(satPreview, 'satellite.jpg')}>Download</button>
          </div>
        )}
        {roadPreview && (
          <div>
            <div>Aerial View (Zoom: {roadZoom})</div>
            <input type="range" min={18} max={21} value={roadZoom} onChange={e => setRoadZoom(Number(e.target.value))} onMouseUp={() => fetchPreview('roadmap')} />
            <img src={roadPreview} alt="Aerial Preview" style={{ width: 300, height: 300, display: 'block', marginTop: 5 }} />
            <button onClick={() => downloadPreview(roadPreview, 'aerial.jpg')}>Download</button>
          </div>
        )}
        {streetPreview && (
          <div>
            <div>Street View (Heading: {streetHeading}°)</div>
            <input type="range" min={0} max={360} value={streetHeading} onChange={e => setStreetHeading(Number(e.target.value))} onMouseUp={() => fetchPreview('streetview')} />
            <img src={streetPreview} alt="Street View Preview" style={{ width: 300, height: 300, display: 'block', marginTop: 5 }} />
            <button onClick={() => downloadPreview(streetPreview, 'streetview.jpg')}>Download</button>
          </div>
        )}
        {autoStreetPreview && (
          <div>
            <div>Auto Front Door Street View</div>
            <img src={autoStreetPreview} alt="Auto Street View" style={{ width: 300, height: 300, display: 'block', marginTop: 5 }} />
            <button onClick={() => downloadPreview(autoStreetPreview, 'auto_streetview.jpg')}>Download</button>
          </div>
        )}
      </div>
      <select value={viewType} onChange={e => setViewType(e.target.value)} style={{ marginLeft: "5px", padding: "5px" }}>
        <option value="roadmap">Aerial (Standard)</option>
        <option value="satellite">Satellite</option>
        <option value="streetview">Street View</option>
      </select>
      <button onClick={captureMap} style={{ marginLeft: "5px", padding: "5px" }} disabled={!confirmed}>
        Capture Map
      </button>
      {showConfirm && (
        <div style={{ marginTop: "10px", fontWeight: "bold" }}>
          <div>Is this the address you are looking for?</div>
          <div style={{ margin: "5px 0" }}>{attomAddress}</div>
          <button onClick={() => handleConfirm(true)} style={{ marginRight: "10px" }}>Yes</button>
          <button onClick={() => handleConfirm(false)}>No</button>
        </div>
      )}
      {confirmed && (
        <div style={{ marginTop: "10px", fontWeight: "bold" }}>
          <div>Google Address: {googleAddress}</div>
          <div>Attom Address: {attomAddress}</div>
          {propertyData && (
            <div style={{ marginTop: "10px" }}>
              <div>Property Data:</div>
              <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px", maxHeight: "200px", overflow: "auto" }}>{JSON.stringify(propertyData, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
      <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={mapZoom} 
          onClick={addHotspot}
          options={{ mapTypeId: viewType === 'satellite' ? 'satellite' : 'roadmap' }}
        >
          {hotspots.map((hotspot, index) => (
            <Marker 
              key={index} 
              position={{ lat: hotspot.lat, lng: hotspot.lng }} 
              title={hotspot.label} 
            />
          ))}
        </GoogleMap>
      </LoadScript>
    </div>
  );
}

export default App;
