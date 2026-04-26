"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const puppeteer_1 = __importDefault(require("puppeteer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
router.post('/generate-l12', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teamId, matchDetails, players } = req.body;
        if (!teamId || !players || !Array.isArray(players)) {
            res.status(400).json({ error: 'Missing required configuration for L12' });
            return;
        }
        const teamSnap = yield firebaseAdmin_1.firestore.collection('teams').doc(String(teamId)).get();
        const team = teamSnap.exists ? teamSnap.data() : { id: Number(teamId), name: 'Echipă Necunoscută' };
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="ro">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #111827; }
                    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #1D3E90; padding-bottom: 20px; }
                    .header h1 { margin: 0; color: #1D3E90; text-transform: uppercase; font-size: 24px; }
                    .header p { margin: 5px 0 0; color: #4B5563; font-size: 14px; }
                    .match-info { display: flex; justify-content: space-between; margin-bottom: 30px; font-weight: bold; background: #F3F4F6; padding: 15px; border-radius: 8px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #E5E7EB; padding: 12px; text-align: left; }
                    th { background-color: #1D3E90; color: white; text-transform: uppercase; font-size: 12px; }
                    td { font-size: 14px; }
                    .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                    .signature-box { text-align: center; width: 200px; }
                    .signature-line { border-bottom: 1px solid #000; height: 40px; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Foaie de Joc L12</h1>
                    <p>Echipa: ${team.name}</p>
                </div>
                
                <div class="match-info">
                    <div>Adversar: ${(matchDetails === null || matchDetails === void 0 ? void 0 : matchDetails.opponent) || '-'}</div>
                    <div>Data: ${(matchDetails === null || matchDetails === void 0 ? void 0 : matchDetails.date) || '-'}</div>
                    <div>Competiție: ${(matchDetails === null || matchDetails === void 0 ? void 0 : matchDetails.competition) || '-'}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px">Nr</th>
                            <th>Nume și Prenume</th>
                            <th>Categorie</th>
                            <th>Număr Tricou</th>
                            <th>Viza Medicală</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${players.map((p, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${p.firstName || ''} ${p.lastName || p.name || ''}</td>
                                <td>${p.category || 'M/F'}</td>
                                <td>${p.number || '-'}</td>
                                <td>Valid</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="footer">
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div>Semnătură Antrenor</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div>Semnătură Arbitru</div>
                    </div>
                </div>
            </body>
            </html>
        `;
        const uploadsDir = path_1.default.join(__dirname, '../../uploads/l12');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        const timestamp = Date.now();
        const safeOpponentName = ((matchDetails === null || matchDetails === void 0 ? void 0 : matchDetails.opponent) || 'Necunoscut').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `L12_${team.name.replace(/[^a-zA-Z0-9]/g, '_')}_${safeOpponentName}_${timestamp}.pdf`;
        const filePath = path_1.default.join(uploadsDir, filename);
        const browser = yield puppeteer_1.default.launch({ headless: true, args: ['--no-sandbox'] });
        const page = yield browser.newPage();
        yield page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        yield page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        yield browser.close();
        const pdfBuffer = fs_1.default.readFileSync(filePath);
        const matchTitle = `${team.name} vs ${(matchDetails === null || matchDetails === void 0 ? void 0 : matchDetails.opponent) || 'Adversar Necunoscut'}`;
        const documentUrl = `/uploads/l12/${filename}`;
        const id = yield (0, firebaseAdmin_1.nextNumericId)('l12Documents');
        yield firebaseAdmin_1.firestore.collection('l12Documents').doc(String(id)).set({
            id,
            teamId: Number(teamId),
            matchTitle,
            documentUrl,
            createdAt: new Date(),
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBuffer));
    }
    catch (error) {
        console.error('Error generating L12:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
}));
router.get('/l12', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('l12Documents').orderBy('createdAt', 'desc').limit(50).get();
        const docs = snap.docs.map((docSnap) => {
            var _a;
            const data = docSnap.data();
            return Object.assign(Object.assign({}, data), { createdAt: (_a = (0, firebaseAdmin_1.toIso)(data.createdAt)) !== null && _a !== void 0 ? _a : new Date().toISOString() });
        });
        res.json(docs);
    }
    catch (error) {
        console.error('Error fetching L12 documents:', error);
        res.status(500).json({ error: 'Failed to fetch' });
    }
}));
exports.default = router;
