export const demoFamilies = [
  { id: 1, name: 'Björk', children: 'Alva', group: 'Ekorren', status: 'Aktiv' },
  { id: 2, name: 'Lind', children: 'Noah och Vera', group: 'Ekorren', status: 'Aktiv' },
  { id: 3, name: 'Ek', children: 'Elias', group: 'Ugglan', status: 'Aktiv' },
  { id: 4, name: 'Asp', children: 'Maja', group: 'Ekorren', status: 'Aktiv' },
  { id: 5, name: 'Alm', children: 'Leo', group: 'Ugglan', status: 'Aktiv' },
  { id: 6, name: 'Rönn', children: 'Ella', group: 'Ugglan', status: 'Aktiv' },
  { id: 7, name: 'Hassel', children: 'Sam', group: 'Ekorren', status: 'Jourbefriad' },
  { id: 8, name: 'Lönn', children: 'Iris', group: 'Ugglan', status: 'Aktiv' },
  { id: 9, name: 'Gran', children: 'Otto', group: 'Ekorren', status: 'Aktiv' },
  { id: 10, name: 'Tall', children: 'Lilly', group: 'Ugglan', status: 'Aktiv' },
  { id: 11, name: 'Sälg', children: 'Milo', group: 'Ugglan', status: 'Aktiv' },
  { id: 12, name: 'Vide', children: 'Freja', group: 'Ekorren', status: 'Aktiv' }
];
for (const f of demoFamilies) f.childRecords=f.children.split(' och ').map(name=>({name,end:''}));
