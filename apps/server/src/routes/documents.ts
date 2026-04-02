import { Router } from 'express';
import { db } from '../db';
import { teams } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const router = Router();

// POST /api/documents/generate-l12
router.post('/generate-l12', async (req, res) => {
    try {
        const { teamId, matchDetails, players } = req.body;
        
        if (!teamId || !players || !Array.isArray(players)) {
            res.status(400).json({ error: 'Missing required configuration for L12' });
            return;
        }

        // Fetch team
        const teamRecords = await db.select().from(teams).where(eq(teams.id, parseInt(teamId, 10)));
        const team = teamRecords[0] || { name: 'Echipă Necunoscută' };

        // Generate simple HTML to be rendered into PDF
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
                    <div>Adversar: ${matchDetails?.opponent || '-'}</div>
                    <div>Data: ${matchDetails?.date || '-'}</div>
                    <div>Competiție: ${matchDetails?.competition || '-'}</div>
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

        const uploadsDir = path.join(__dirname, '../../uploads/l12');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        const safeOpponentName = (matchDetails?.opponent || 'Necunoscut').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `L12_${team.name.replace(/[^a-zA-Z0-9]/g, '_')}_${safeOpponentName}_${timestamp}.pdf`;
        const filePath = path.join(uploadsDir, filename);

        // Generate PDF using puppeteer
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        await browser.close();

        // Read for immediate response
        const pdfBuffer = fs.readFileSync(filePath);

        // Record it in DB
        const matchTitle = `${team.name} vs ${matchDetails?.opponent || 'Adversar Necunoscut'}`;
        const documentUrl = `/uploads/l12/${filename}`;

        await db.insert(require('../db/schema').l12Documents).values({
            teamId: team.id,
            matchTitle,
            documentUrl
        });

        // Send PDF response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBuffer));
        
    } catch (error) {
        console.error('Error generating L12:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// GET /api/documents/l12
router.get('/l12', async (req, res) => {
    try {
        const { l12Documents } = require('../db/schema');
        const docs = await db.select()
            .from(l12Documents)
            .orderBy(desc(l12Documents.createdAt))
            .limit(50);
            
        res.json(docs);
    } catch (error) {
        console.error('Error fetching L12 documents:', error);
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

export default router;
