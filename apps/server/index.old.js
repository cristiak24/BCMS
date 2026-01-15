// apps/server/index.js
const express = require('express');
const cors = require('cors');
const app = express();

// Permite oricui să se conecteze (important pt dezvoltare)
app.use(cors()); 
app.use(express.json());

// Simulăm o listă de jucători
app.get('/api/jucatori', (req, res) => {
  const jucatori = [
    { id: 1, nume: "Popescu Andrei", numar: 23 },
    { id: 2, nume: "Ionescu Mihai", numar: 10 },
    { id: 3, nume: "Radu Vlad", numar: 7 }
  ];
  
  res.json(jucatori);
});

// Ascultă pe toate interfețele de rețea (0.0.0.0), nu doar pe localhost
app.listen(3000, '0.0.0.0', () => {
  console.log('Serverul rulează pe portul 3000');
});