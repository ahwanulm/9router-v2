const fs = require('fs');
const css = `
/* Global Animations from Landing Page */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes dash {
  to { stroke-dashoffset: -20; }
}
@keyframes blob {
  0%, 100% { 
    transform: translate(0, 0) scale(1);
  }
  33% { 
    transform: translate(30px, -50px) scale(1.1);
  }
  66% { 
    transform: translate(-20px, 20px) scale(0.9);
  }
}
.animate-blob {
  animation: blob 20s ease-in-out infinite;
}
.animate-blob-delayed-1 {
  animation: blob 20s ease-in-out infinite;
  animation-delay: 2s;
}
.animate-blob-delayed-2 {
  animation: blob 20s ease-in-out infinite;
  animation-delay: 4s;
}
`;
fs.appendFileSync('/home/data/Project/amrouter/frontend/src/globals.css', css);
