import { buildAutoRouter } from "./dist/autoRouter.js";
buildAutoRouter().then(router => {
  console.log("Router built!");
}).catch(console.error);
