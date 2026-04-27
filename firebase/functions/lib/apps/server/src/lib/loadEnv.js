"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadServerEnv = loadServerEnv;
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadServerEnv() {
    const candidates = [
        path_1.default.resolve(__dirname, '../../.env.local'),
        path_1.default.resolve(process.cwd(), 'apps/server/.env.local'),
        path_1.default.resolve(process.cwd(), '.env.local'),
    ];
    const localEnvPath = candidates.find((candidate) => fs_1.default.existsSync(candidate));
    if (localEnvPath) {
        dotenv_1.default.config({ path: localEnvPath, override: false });
    }
}
