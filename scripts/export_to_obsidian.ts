import * as fs from 'fs';
import * as path from 'path';

const filesToExtract = [
  'src/lib/core/math.ts',
  'src/lib/core/evaluator.ts',
  'src/lib/core/generator.ts',
  'scripts/start_tree_generator.ts',
  'src/lib/api/lichess.ts',
  'src/lib/api/retry.ts',
  'src/lib/db/operations.ts',
  'src/lib/api/gemini.ts' 
];

const destFolder = 'C:\\Users\\vyaro\\OneDrive\\Рабочий стол\\NewObsidian';
const destFile = path.join(destFolder, 'ChessRepertoireCode.md');

let mdContent = '# Chess Repertoire Core Logic\n\n';

for (const file of filesToExtract) {
  const filePath = path.join(process.cwd(), file);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    mdContent += `## File: \`${file}\`\n\n\`\`\`typescript\n${content}\n\`\`\`\n\n---\n\n`;
  } catch (e: any) {
    console.error(`Failed to read ${file}:`, e.message);
  }
}

try {
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }
  fs.writeFileSync(destFile, mdContent, 'utf-8');
  console.log(`Successfully exported to ${destFile}`);
} catch (e: any) {
  console.error(`Failed to write to destination:`, e.message);
}
