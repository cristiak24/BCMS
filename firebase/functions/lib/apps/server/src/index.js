"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loadEnv_1 = require("./lib/loadEnv");
const app_1 = require("./app");
(0, loadEnv_1.loadServerEnv)();
const port = process.env.PORT || 3000;
app_1.app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
