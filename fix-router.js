const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let modified = false;

      // Replace import
      if (content.includes('useRouter')) {
        content = content.replace(/useRouter/g, 'useNavigate');
        modified = true;
      }
      
      // Replace instantiation
      if (content.includes('const router = useNavigate()')) {
        content = content.replace(/const router = useNavigate\(\)/g, 'const navigate = useNavigate()');
        modified = true;
      }

      // Replace usages
      if (content.includes('router.')) {
        content = content.replace(/router\.push\((.*?)\)/g, 'navigate($1)');
        content = content.replace(/router\.replace\((.*?)\)/g, 'navigate($1, { replace: true })');
        content = content.replace(/router\.back\(\)/g, 'navigate(-1)');
        content = content.replace(/router\.refresh\(\)/g, 'navigate(0)');
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

walk(path.join(__dirname, 'frontend/src'));
