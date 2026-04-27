"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadServerEnv = loadServerEnv;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
function loadServerEnv() {
    const localEnvPath = path_1.default.resolve(__dirname, '../../.env.local');
    dotenv_1.default.config({ path: localEnvPath, override: false });
}
