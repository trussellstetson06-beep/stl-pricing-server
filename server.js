import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { STLLoader } from "three-stdlib";
import * as THREE from "three";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ✅ UPLOAD DIRECTORY
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

// ✅ MATERIAL + PRICING CONSTANTS
const PLA_DENSITY = 1.24;     // g/cm³
const INFILL_FACTOR = 0.42;  // 10% infill
const PRICE_PER_GRAM = 0.63; // $/g
const MIN_PRICE = 2;        // $
const MAX_GRAMS = 200;      // g (after infill)

app.get("/", (req, res) => {
  res.send("Dimensional Prints STL pricing + storage API is running ✅");
});

// ✅ PRICE + SAVE STL
app.post("/price", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const tempPath = req.file.path;
    const buffer = fs.readFileSync(tempPath);

    // ✅ Convert Node Buffer → ArrayBuffer
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);

    if (!geometry?.attributes?.position) {
      fs.unlinkSync(tempPath);
      throw new Error("Invalid STL geometry.");
    }

    let volume = 0;
    const position = geometry.attributes.position.array;

    for (let i = 0; i < position.length; i += 9) {
      const p1 = new THREE.Vector3(position[i], position[i + 1], position[i + 2]);
      const p2 = new THREE.Vector3(position[i + 3], position[i + 4], position[i + 5]);
      const p3 = new THREE.Vector3(position[i + 6], position[i + 7], position[i + 8]);
      volume += p1.dot(p2.cross(p3)) / 6.0;
    }

    volume = Math.abs(volume); // mm³

    // ✅ SOLID VOLUME → CM³
    const cm3 = volume / 1000;

    // ✅ APPLY 10% INFILL
    const grams = cm3 * PLA_DENSITY * INFILL_FACTOR;

    if (grams > MAX_GRAMS) {
      fs.unlinkSync(tempPath);
      return res.status(400).json({ error: "Model exceeds 200g auto limit." });
    }

    let price = grams * PRICE_PER_GRAM;
    if (price < MIN_PRICE) price = MIN_PRICE;

    // ✅ PERMANENT FILE SAVE
    const id = crypto.randomBytes(12).toString("hex");
    const finalName = `${id}.stl`;
    const finalPath = path.join(uploadDir, finalName);
    fs.renameSync(tempPath, finalPath);

    // ✅ PUBLIC DOWNLOAD LINK
    const fileUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "stl-pricing-server.onrender.com"}/uploads/${finalName}`;

    res.json({
      grams: grams.toFixed(2),
      price: price.toFixed(2),
      fileUrl
    });

  } catch (err) {
    console.error("STL Error:", err);
    return res.status(500).json({ error: "Failed to process STL." });
  }
});

// ✅ PUBLIC FILE ACCESS
app.use("/uploads", express.static(uploadDir));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`STL pricing + storage server running on port ${PORT} ✅`);
});
