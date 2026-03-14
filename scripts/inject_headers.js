const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "header_data.json");

if (!fs.existsSync(dataPath)) {
    console.error("Error: header_data.json not found.");
    process.exit(1);
}

const headerData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const files = Object.keys(headerData);

console.log(`Found ${files.length} files to process.`);

files.forEach((filePath) => {
    // Resolve absolute path if relative is provided, assuming relative to project root
    // But our data will likely provide absolute paths or paths relative to cwd
    // Let's assume paths are relative to project root (parent of 'scripts')
    const fullPath = path.resolve(__dirname, "..", filePath);

    if (!fs.existsSync(fullPath)) {
        console.warn(`Warning: File not found: ${fullPath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, "utf8");
    const header = headerData[filePath];

    // Check if header already exists (simple check)
    if (content.trim().startsWith("/**\n * 这个文件主要是干什么的")) {
        console.log(`Skipping ${filePath}: Header already detected.`);
        return;
    }

    const newContent = header + "\n" + content;
    fs.writeFileSync(fullPath, newContent, "utf8");
    console.log(`Processed: ${filePath}`);
});

console.log("Batch processing complete.");
