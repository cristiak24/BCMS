/**
 * FRB competitions by the `leagueId` each frbaschet.ro page embeds (checked
 * 2026-10-18; mirrored by GET /api/basketball/leagues). Several girls' ids were
 * wrong: "U14" opened the U16 league, and U16, U19, U12, Supercupa and CAN
 * pointed at ids with no seasons. There is no girls' Supercupa page on FRB.
 */
export const LEAGUES_M = [
    { id: '25493', name: 'LNBM' },
    { id: '25523', name: 'Liga 1' },
    { id: '8336', name: 'Cupa României' },
    { id: '39679', name: 'Supercupa' },
    { id: '8342', name: 'U20' },
    { id: '43666', name: 'U19' },
    { id: '8339', name: 'U18' },
    { id: '8353', name: 'U17' },
    { id: '8348', name: 'U16' },
    { id: '8351', name: 'U15' },
    { id: '8346', name: 'U14' },
    { id: '8349', name: 'U13' },
    { id: '8943', name: 'U12' },
    { id: '44533', name: 'U12 4x4' },
    { id: '35627', name: 'CAN U12' },
    { id: '8963', name: 'CAN U10' },
];

export const LEAGUES_F = [
    { id: '25503', name: 'LNBF' },
    { id: '25533', name: 'Liga 1' },
    { id: '8337', name: 'Cupa României' },
    { id: '8343', name: 'U20' },
    { id: '43665', name: 'U19' },
    { id: '8340', name: 'U18' },
    { id: '8354', name: 'U17' },
    { id: '8347', name: 'U16' },
    { id: '8352', name: 'U15' },
    { id: '8345', name: 'U14' },
    { id: '8350', name: 'U13' },
    { id: '8953', name: 'U12' },
    { id: '44534', name: 'U12 4x4' },
    { id: '35629', name: 'CAN U12' },
    { id: '8973', name: 'CAN U10' },
];
