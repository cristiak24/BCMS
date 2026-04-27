"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const finance_1 = __importDefault(require("./routes/finance"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const profile_1 = __importDefault(require("./routes/profile"));
const admin_1 = __importDefault(require("./routes/admin"));
const manageAccess_1 = __importDefault(require("./routes/manageAccess"));
const invitations_1 = __importDefault(require("./routes/invitations"));
const clubs_1 = __importDefault(require("./routes/clubs"));
const superAdmin_1 = __importDefault(require("./routes/superAdmin"));
const basketball_1 = __importDefault(require("./routes/basketball"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const teams_1 = __importDefault(require("./routes/teams"));
const playerRoutes_1 = __importDefault(require("./routes/playerRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const documents_1 = __importDefault(require("./routes/documents"));
const path_1 = __importDefault(require("path"));
const loadEnv_1 = require("./lib/loadEnv");
(0, loadEnv_1.loadServerEnv)();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
function normalizeOrigin(value) {
    return (value === null || value === void 0 ? void 0 : value.trim().replace(/\/+$/, '')) || null;
}
const configuredOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_BASE_URL,
    process.env.FIREBASE_HOSTING_URL,
]
    .flatMap((value) => String(value !== null && value !== void 0 ? value : '').split(','))
    .map(normalizeOrigin)
    .filter((value) => Boolean(value));
const developmentOrigins = [
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];
const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(process.env.NODE_ENV === 'production' ? [] : developmentOrigins),
]);
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }
        const normalizedOrigin = normalizeOrigin(origin);
        if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-User-Id', 'X-User-Uid', 'X-User-Role', 'X-User-Club-Id'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
}));
app.use(express_1.default.json());
console.log('Registering routes...');
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path}`);
    next();
});
app.use('/api/finance', finance_1.default);
app.use('/api/users', users_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/profile', profile_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/manage-access', manageAccess_1.default);
app.use('/api/invitations', invitations_1.default);
app.use('/api/clubs', clubs_1.default);
app.use('/api/super-admin', superAdmin_1.default);
app.use('/api/basketball', basketball_1.default);
app.use('/api/dashboard', dashboard_1.default);
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
