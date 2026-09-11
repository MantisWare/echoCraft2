#!/usr/bin/env node
// Regenerates every EchoCraft brand asset from the single mark definition below.
//
//   node scripts/generate-brand-icons.js
//
// Writes src/assets/{logo.svg,icon.png,icon.icns,icon.ico,iconTemplate@3x.png}
// and the ICON.png layer of the macOS 26 icon bundle. Run
// `npm run compile:mac-icon` afterwards to rebuild Assets.car from that layer.
//
// Requires macOS (sips, iconutil) and rsvg-convert (`brew install librsvg`).
// Nothing in the build depends on this script — the generated files are
// committed — so a machine without those tools can still build the app.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ASSETS = path.join(__dirname, "..", "src", "assets");
const ICON_BUNDLE_LAYER = path.join(ASSETS, "echocraft.icon", "Assets", "ICON.png");

// The EchoCraft mark: a speech bubble with an antenna, a ring-and-dot "eye" and
// a smile, authored in a 15x15 box. The ring and the smile are holes in the
// bubble (fill-rule evenodd), so whatever sits behind the mark shows through
// them — on the tiles below that is the gradient.
const MARK_VIEWBOX = 15;
const MARK_PATHS = [
  `<path d="M7.5 5C6.67157 5 6 5.67157 6 6.5C6 7.32843 6.67157 8 7.5 8C8.32843 8 9 7.32843 9 6.5C9 5.67157 8.32843 5 7.5 5Z" fill="currentColor"/>`,
  `<path fill-rule="evenodd" clip-rule="evenodd" d="M8.99999 1.99988L8 1.99989V0H7V1.9999L5.99991 1.9999C2.68625 1.99993 9.17923e-06 4.68619 0 7.99985C-9.179e-06 11.3135 2.68627 13.9998 5.99996 13.9998H9.00004C9.13059 13.9998 9.26024 13.9957 9.38884 13.9874L13.3788 14.9849C13.5492 15.0275 13.7294 14.9776 13.8536 14.8534C13.9778 14.7292 14.0277 14.549 13.9851 14.3786L13.4081 12.0704C14.3958 11.0012 15 9.57071 15 7.99985C15 4.68614 12.3137 1.99985 8.99999 1.99988ZM5 6.5C5 5.11929 6.11929 4 7.5 4C8.88071 4 10 5.11929 10 6.5C10 7.88071 8.88071 9 7.5 9C6.11929 9 5 7.88071 5 6.5ZM7.49998 12C6.43628 12 5.45756 11.6303 4.68726 11.0128L5.31272 10.2326C5.91201 10.713 6.67179 11 7.49998 11C8.32816 11 9.08794 10.713 9.68723 10.2326L10.3127 11.0128C9.54239 11.6303 8.56367 12 7.49998 12Z" fill="currentColor"/>`,
].join("\n  ");

// Brand gradient, carried over from EchoCraft 1.x: blue into violet.
const GRADIENT_FROM = "#3B82F6";
const GRADIENT_TO = "#8B5CF6";
// Apple draws macOS app icons on a 1024 canvas with the tile inset — matching
// that keeps EchoCraft the same visual size as its Dock neighbours.
const MACOS_TILE = 824;
const MACOS_TILE_RADIUS = 185;
// Corner radius of the standalone tile (logo.svg, icon.png, icon.ico), as a
// share of its width. The macOS tile above uses the same ratio.
const TILE_RADIUS_RATIO = 185 / 824;

function markLayer(size, offsetX, offsetY, color) {
  const scale = size / MARK_VIEWBOX;
  return `<g transform="translate(${offsetX} ${offsetY}) scale(${round(scale)})" color="${color}">
  ${MARK_PATHS}
</g>`;
}

function round(value) {
  return Number(value.toFixed(4));
}

// A gradient tile with the mark centred on it. `inset` leaves transparent
// margin around the tile, which is what gives the .icns its Apple-grid size.
function tileSvg({ canvas, tile = canvas, radius, markRatio = 0.62 }) {
  const inset = (canvas - tile) / 2;
  const mark = tile * markRatio;
  const markOffset = inset + (tile - mark) / 2;
  return `<svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="tile" x1="${inset}" y1="${inset}" x2="${inset + tile}" y2="${inset + tile}" gradientUnits="userSpaceOnUse">
    <stop stop-color="${GRADIENT_FROM}"/>
    <stop offset="1" stop-color="${GRADIENT_TO}"/>
  </linearGradient>
</defs>
<rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${radius}" fill="url(#tile)"/>
${markLayer(mark, markOffset, markOffset, "#ffffff")}
</svg>
`;
}

// Menu bar icons are template images: a black silhouette on transparency that
// macOS recolours for the light and dark menu bar.
function templateSvg(canvas, markRatio) {
  const mark = canvas * markRatio;
  const offset = (canvas - mark) / 2;
  return `<svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" fill="none" xmlns="http://www.w3.org/2000/svg">
${markLayer(mark, offset, offset, "#000000")}
</svg>
`;
}

function renderPng(svg, size, destination) {
  const tmp = path.join(workDir, `${path.basename(destination, ".png")}-${size}.svg`);
  fs.writeFileSync(tmp, svg);
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), tmp, "-o", destination]);
  return destination;
}

// PNG-encoded ICO, which every Windows version since Vista reads.
function writeIco(pngPaths, destination) {
  const images = pngPaths.map((file) => fs.readFileSync(file));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map((image, index) => {
    const size = ICO_SIZES[index];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });

  fs.writeFileSync(destination, Buffer.concat([header, ...entries, ...images]));
  return destination;
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_VARIANTS = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "echocraft-icons-"));
const written = [];

try {
  // The product logo: a rounded tile, used in-app and as the source for the
  // raster icons below.
  const logoSvg = tileSvg({ canvas: 1024, radius: round(1024 * TILE_RADIUS_RATIO) });
  fs.writeFileSync(path.join(ASSETS, "logo.svg"), logoSvg);
  written.push(path.join(ASSETS, "logo.svg"));

  written.push(renderPng(logoSvg, 512, path.join(ASSETS, "icon.png")));

  // macOS 26+ composes its own material behind this layer, so it is full bleed.
  written.push(renderPng(tileSvg({ canvas: 1024, radius: 0 }), 1024, ICON_BUNDLE_LAYER));

  const macSvg = tileSvg({
    canvas: 1024,
    tile: MACOS_TILE,
    radius: MACOS_TILE_RADIUS,
  });
  const iconset = path.join(workDir, "icon.iconset");
  fs.mkdirSync(iconset);
  for (const [name, size] of ICNS_VARIANTS) {
    renderPng(macSvg, size, path.join(iconset, name));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(ASSETS, "icon.icns")]);
  written.push(path.join(ASSETS, "icon.icns"));

  const icoFrames = ICO_SIZES.map((size) =>
    renderPng(logoSvg, size, path.join(workDir, `ico-${size}.png`))
  );
  written.push(writeIco(icoFrames, path.join(ASSETS, "icon.ico")));

  // 48px is the @3x menu bar slot; the mark keeps a 2px breathing margin so it
  // does not crowd the neighbouring status items.
  written.push(renderPng(templateSvg(48, 44 / 48), 48, path.join(ASSETS, "iconTemplate@3x.png")));
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}

for (const file of written) {
  console.log(
    `${path.relative(path.join(__dirname, ".."), file)} (${fs.statSync(file).size} bytes)`
  );
}
