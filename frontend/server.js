const express = require('express');
const path = require('path');
const app = express();

// Bind to the port injected by Railway
const PORT = process.env.PORT || 3000;

// CRACO/CRA outputs to the 'build' directory
const BUILD_DIR = 'build'; 

// 1. Serve all static files (CSS, JS, Images) from the build directory first
app.use(express.static(path.join(__dirname, BUILD_DIR)));

// 2. The Express 5.x Compatible Catch-All
// If the request makes it past the static files, it must be a client-side route.
// Hand them index.html and let React Router take over.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, BUILD_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend static server running on port ${PORT}`);
});