**Google Maps Hotspot Creator**

This project allows users to search for a location on Google Maps, add hotspots by clicking on the map, and capture the map as an annotated image. The project uses React for the frontend and Flask as the backend, with the help of Google Maps API for map functionalities.

**Features**

Search for a Location: Enter a place name and navigate to it on the map.

Add Hotspots: Click on the map to add labeled hotspots.

Capture Map: Capture the current map view along with hotspots as a JPEG image.

Download Annotated Image: The captured image will contain labeled hotspots.

**Technologies Used**

Frontend: React, Google Maps API, JavaScript

Backend: Flask, OpenCV, Python

API Services: Google Maps Static API, Google Geocoding API

Tools: Git, GitHub, VS Code

**Setup and Installation**

**1. Clone the Repository**


    git clone https://github.com/mahathig531/mapsapi.git
    cd mapsapi


**2. Google API Key Setup**


You need to have a Google Maps API Key with the following enabled:

  Maps Static API
  
  Geocoding API
  
  Maps JavaScript API
  
  Places API


Create a .env file in the frontend directory:


    cd mapsapi


Add the following to the .env file:


    REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY


Frontend Setup (React)


Navigate to the client folder:


    cd mapsapi


**Install dependencies:**


    npm install


**Run the frontend:**


    npm start


**Open the app in your browser:**


    http://localhost:3000


**Backend Setup (Flask)**

Open a new terminal and navigate to the server folder:

    cd server

**Create a virtual environment:**

    python -m venv venv

**Activate the virtual environment:**

**Windows:**

    venv\Scripts\activate

**Mac/Linux:**

    source venv/bin/activate

**Install required packages:**

    pip install -r requirements.txt

**Run the Backend server:**

    uvicorn main:app
    

**The server will run on:**

    http://localhost:8000

**How to Use**

Open the React application in your browser:

    http://localhost:3000


Search for a location using the input box and click Go.

Add a hotspot by clicking on the map. You will be prompted to enter a label.

Capture the map with hotspots by clicking the Capture Map button.

The captured map with labeled hotspots will be downloaded as a JPEG image.


