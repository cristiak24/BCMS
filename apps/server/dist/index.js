"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const finance_1 = __importDefault(require("./routes/finance"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const basketball_1 = __importDefault(require("./routes/basketball"));
const teams_1 = __importDefault(require("./routes/teams"));
const playerRoutes_1 = __importDefault(require("./routes/playerRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const documents_1 = __importDefault(require("./routes/documents"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Manual CORS middleware — sets headers directly, fully compatible with Express 5
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    // Respond to preflight immediately
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
app.use(express_1.default.json());
console.log('Registering routes...');
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path}`);
    next();
});
app.use('/api/finance', finance_1.default);
app.use('/api/users', users_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/basketball', basketball_1.default);
app.use('/api/teams', teams_1.default);
app.use('/api/players', playerRoutes_1.default);
app.use('/api/events', eventRoutes_1.default);
app.use('/api/documents', documents_1.default);
// Serve uploads statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
console.log('Routes registered.');
app.get('/', (_req, res) => {
    res.send('BCMS API is running');
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
