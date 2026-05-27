const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images"
  : path.join(__dirname, "../cloud/images");

const generateAvatar = async (name) => {
  const parts   = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";

  const size = 200;
  const fontSize = initials.length === 1 ? 90 : 78;

  // Build SVG with blue background and white text
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size / 2}" fill="#2563EB"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">
        ${initials}
      </text>
    </svg>`
  );

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const filename = `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;

  await sharp(svg)
    .resize(size, size)
    .webp({ quality: 90 })
    .toFile(path.join(IMAGES_DIR, filename));

  return `${process.env.BACKEND_URL}/app/cloud/images/${filename}`;
};

module.exports = generateAvatar;
