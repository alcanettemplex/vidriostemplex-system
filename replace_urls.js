const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, 'frontend-web', 'src');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('http://localhost:3001')) {
        content = content.replace(/http:\/\/localhost:3001/g, '` + (process.env.REACT_APP_API_URL || "http://localhost:3001") + `');
        // Fix string interpolations from '` + process.env... + `/api/...' to `${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/...`
        content = content.replace(/'` \+ \(process\.env\.REACT_APP_API_URL \|\| "http:\/\/localhost:3001"\) \+ `([^']*)'/g, '`${process.env.REACT_APP_API_URL || "http://localhost:3001"}$1`');

        // For existing template literals using `http://localhost:3001/api/...${...}`
        content = content.replace(/`\` \+ \(process\.env\.REACT_APP_API_URL \|\| "http:\/\/localhost:3001"\) \+ `(.*?)`/g, '`${process.env.REACT_APP_API_URL || "http://localhost:3001"}$1`');

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            replaceInFile(fullPath);
        }
    }
}

processDirectory(directory);
console.log('Realizado con éxito.');
