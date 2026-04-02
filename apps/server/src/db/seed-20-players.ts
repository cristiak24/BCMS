import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const sql = neon(process.env.DATABASE_URL!);

async function seedPlayers() {
    console.log('Seeding 20 realistic basketball players...');
    try {
        const players = [
            { firstName: 'Andrei', lastName: 'Popescu', number: 5, birthYear: 2008, email: 'andrei.popescu@bcms.ro' },
            { firstName: 'Mihai', lastName: 'Ionescu', number: 12, birthYear: 2007, email: 'mihai.ionescu@bcms.ro' },
            { firstName: 'Cristian', lastName: 'Dumitru', number: 8, birthYear: 2009, email: 'cristian.dumitru@bcms.ro' },
            { firstName: 'Stefan', lastName: 'Stoica', number: 15, birthYear: 2008, email: 'stefan.stoica@bcms.ro' },
            { firstName: 'Radu', lastName: 'Gheorghe', number: 10, birthYear: 2007, email: 'radu.gheorghe@bcms.ro' },
            { firstName: 'Alexandru', lastName: 'Matei', number: 3, birthYear: 2010, email: 'alex.matei@bcms.ro' },
            { firstName: 'Gabriel', lastName: 'Micu', number: 21, birthYear: 2008, email: 'gabriel.micu@bcms.ro' },
            { firstName: 'Vlad', lastName: 'Constantin', number: 14, birthYear: 2007, email: 'vlad.constantin@bcms.ro' },
            { firstName: 'Bogdan', lastName: 'Stancu', number: 7, birthYear: 2009, email: 'bogdan.stancu@bcms.ro' },
            { firstName: 'Laurentiu', lastName: 'Nica', number: 6, birthYear: 2008, email: 'laurentiu.nica@bcms.ro' },
            { firstName: 'George', lastName: 'Dan', number: 23, birthYear: 2007, email: 'george.dan@bcms.ro' },
            { firstName: 'Claudiu', lastName: 'Pop', number: 11, birthYear: 2008, email: 'claudiu.pop@bcms.ro' },
            { firstName: 'Adrian', lastName: 'Vasile', number: 0, birthYear: 2009, email: 'adrian.vasile@bcms.ro' },
            { firstName: 'Ionut', lastName: 'Marin', number: 4, birthYear: 2010, email: 'ionut.marin@bcms.ro' },
            { firstName: 'Valentin', lastName: 'Bara', number: 13, birthYear: 2007, email: 'valentin.bara@bcms.ro' },
            { firstName: 'Marius', lastName: 'Cristian', number: 99, birthYear: 2008, email: 'marius.cristian@bcms.ro' },
            { firstName: 'Paul', lastName: 'Lupu', number: 22, birthYear: 2009, email: 'paul.lupu@bcms.ro' },
            { firstName: 'Eugen', lastName: 'Munteanu', number: 33, birthYear: 2007, email: 'eugen.munteanu@bcms.ro' },
            { firstName: 'Rares', lastName: 'Dragomir', number: 18, birthYear: 2008, email: 'rares.dragomir@bcms.ro' },
            { firstName: 'Tudor', lastName: 'Roman', number: 9, birthYear: 2009, email: 'tudor.roman@bcms.ro' }
        ];

        for (const player of players) {
            await sql`
                INSERT INTO "players" (first_name, last_name, name, number, birth_year, email, status)
                VALUES (${player.firstName}, ${player.lastName}, ${player.firstName + ' ' + player.lastName}, ${player.number}, ${player.birthYear}, ${player.email}, 'active');
            `;
        }

        console.log('Seeding completed successfully!');
    } catch (error) {
        console.error('Seeding failed:', error);
    }
}

seedPlayers();
