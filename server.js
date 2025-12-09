import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { STLLoader } from "three-stdlib";
import * as THREE from "three";

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });

const PLA_DENSITY = 1.24; // g/cm3
const PRICE_PER_GRAM = 0.30;
const MIN_PRICE = 10;
const MAX_GRAMS = 200;

app.get("/", (req, res) => {
  res.send("Dimensional Prints STL pricing API is running ✅");
});

app.post("/price", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const buffer = fs.readFileSync(filePath);

    const loader = new STLLoader();
    const geometry = loader.parse(buffer);

    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    let volume = 0;
    const position = geometry.attributes.position.array;

    for (let i = 0; i < position.length; i += 9) {
      const p1 = new THREE.Vector3(position[i], position[i + 1], position[i + 2]);
      const p2 = new THREE.Vector3(position[i + 3], position[i + 4], position[i + 5]);
      const p3 = new THREE.Vector3(position[i + 6], position[i + 7], position[i + 8]);
      volume += p1.dot(p2.cross(p3)) / 6.0;
    }

    volume = Math.abs(volume); // mm³

    const cm3 = volume / 1000;
    const grams = cm3 * PLA_DENSITY;

    if (grams > MAX_GRAMS) {
      return res.status(400).json({ error: "Model exceeds 200g auto limit." });
    }

    let price = grams * PRICE_PER_GRAM;
    if (price < MIN_PRICE) price = MIN_PRICE;

    fs.unlinkSync(filePath);

    res.json({
      grams: grams.toFixed(2),
      price: price.toFixed(2)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process STL." });
  }
});

app.listen(3000, () => {
  console.log("STL pricing server running on port 3000");
});
