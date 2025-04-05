import React, { useState, useCallback } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';
import { toPng } from 'html-to-image';

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
  const [mapZoom, setMapZoom] = useState(12);  // Default zoom level
  const [location, setLocation] = useState("");
  const [hotspots, setHotspots] = useState([]);

  // Fetch coordinates based on the location entered
  const fetchCoordinates = async () => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.status === "OK" && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        const locationType = data.results[0].types[0];

        // Adjust zoom level based on location type
        let newZoom = 12;  // Default zoom for cities
        if (locationType === "establishment" || locationType === "point_of_interest") {
          newZoom = 16;  // Closer for specific places
        } else if (locationType === "locality" || locationType === "political") {
          newZoom = 12;  // General zoom for cities
        } else {
          newZoom = 14;  // Medium zoom for addresses
        }

        setMapCenter({ lat, lng });
        setMapZoom(newZoom);  // Dynamically set zoom level
        console.log(`Location found: ${lat}, ${lng} with zoom: ${newZoom}`);
      } else {
        alert("Location not found!");
      }
    } catch (error) {
      console.error("Error fetching coordinates:", error);
      alert("Failed to fetch coordinates.");
    }
  };

  // Handle map click to add a hotspot
  const addHotspot = useCallback((event) => {
    const label = prompt("Enter hotspot label:");
    if (label) {
      const newHotspot = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
        label: label
      };
      setHotspots((prev) => [...prev, newHotspot]);
    }
  }, []);

  // Capture the map view along with hotspots
  const captureMap = async () => {
    try {
      const response = await fetch('http://localhost:8000/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lat: mapCenter.lat, 
          lng: mapCenter.lng, 
          zoom: mapZoom, 
          hotspots 
        })
      });
      const blob = await response.blob();
      const imageURL = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = imageURL;
      link.download = 'map_capture.jpg';
      link.click();
      URL.revokeObjectURL(imageURL);
    } catch (error) {
      console.error("Error capturing map:", error);
      alert("Failed to capture map.");
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
      />
      <button onClick={fetchCoordinates} style={{ marginLeft: "5px", padding: "5px" }}>
        Go
      </button>
      <button onClick={captureMap} style={{ marginLeft: "5px", padding: "5px" }}>
        Capture Map
      </button>
      <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={mapZoom}  // Use the dynamically set zoom level
          onClick={addHotspot}
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
