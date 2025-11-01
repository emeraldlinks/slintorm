// import fs from "fs";
// import path from "path";

// export function watchMigrate(modelsDir = "./models", runMigration: () => void) {
//   const absolutePath = path.resolve(modelsDir);
//   const watchedFiles = new Map<string, string>();

//   // Helper: track hash to detect real content change
//   function hash(content: string) {
//     let h = 0;
//     for (let i = 0; i < content.length; i++) {
//       h = (h * 31 + content.charCodeAt(i)) >>> 0;
//     }
//     return h.toString();
//   }

//   // Initial scan
//   fs.readdirSync(absolutePath).forEach((file) => {
//     const fullPath = path.join(absolutePath, file);
//     if (fs.statSync(fullPath).isFile()) {
//       const content = fs.readFileSync(fullPath, "utf8");
//       watchedFiles.set(fullPath, hash(content));
//     }
//   });

//   // Watch the directory
//   fs.watch(absolutePath, { recursive: false }, (eventType, filename) => {
//     if (!filename) return;
//     const fullPath = path.join(absolutePath, filename);

//     try {
//       const content = fs.readFileSync(fullPath, "utf8");
//       const newHash = hash(content);
//       const oldHash = watchedFiles.get(fullPath);

//       if (oldHash !== newHash) {
//         watchedFiles.set(fullPath, newHash);
//         console.log(`[db] Detected change in ${filename}. Running migration...`);
//         runMigration();
//       }
//     } catch {
//       // File might have been deleted
//       watchedFiles.delete(fullPath);
//       console.log(`[db] File ${filename} removed. Running migration...`);
//       runMigration();
//     }
//   });

//   console.log(`[db] Watching for model changes in ${absolutePath}...`);
// }
