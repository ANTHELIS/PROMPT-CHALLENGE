## Project Setup

This project consists of a React frontend and an Express/MongoDB backend.

### Prerequisites

- Node.js (v18+ recommended)
- MongoDB (Local or Atlas URI)

### Installation

1.  **Install Root Dependencies (Frontend)**
    ```bash
    npm install
    ```

2.  **Install Server Dependencies (Backend)**
    ```bash
    cd server
    npm install
    cd ..
    ```

### Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Frontend
GEMINI_API_KEY=your_gemini_api_key_here

# Backend
PORT=5000
MONGO_URI=your_mongodb_connection_string
```

> **Note:** The backend is configured to read the `.env` file from the root directory.

### Running the Application

You need to run both the backend and frontend terminals.

**1. Start the Backend Server**

From the root directory:
```bash
npm run server
```
*Alternatively, you can go into the `server` folder and run `npm run dev`.*
The server will start on `http://localhost:5000`.

**2. Start the Frontend**

From the root directory (open a new terminal):
```bash
npm run dev
```
The frontend will start on the URL provided by Vite (typically `http://localhost:5173`).
