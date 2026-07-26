/**
 * Name pools for procedurally generated people: League One and Two squads, youth intake,
 * regens, staff, agents and foreign clubs.
 *
 * Names are grouped by nationality so a Brazilian youth prospect doesn't end up called Gareth
 * Higginbotham. The English pool is deliberately the largest, since most generated players in an
 * English pyramid game are English.
 */

export interface NamePool {
  first: string[];
  last: string[];
}

export const NAME_POOLS: Record<string, NamePool> = {
  England: {
    first: [
      'Jack', 'Harry', 'Charlie', 'George', 'Oliver', 'Thomas', 'Jacob', 'Alfie', 'Joshua', 'James',
      'Ethan', 'Lewis', 'Callum', 'Ryan', 'Kieran', 'Dylan', 'Reece', 'Tyler', 'Louie', 'Bradley',
      'Connor', 'Liam', 'Aaron', 'Nathan', 'Josh', 'Adam', 'Luke', 'Sam', 'Ben', 'Kyle',
      'Jordan', 'Declan', 'Mason', 'Finley', 'Archie', 'Freddie', 'Theo', 'Isaac', 'Leo', 'Toby',
      'Rhys', 'Cameron', 'Joel', 'Corey', 'Elliot', 'Marcus', 'Jamie', 'Danny', 'Billy', 'Ollie',
    ],
    last: [
      'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson',
      'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood',
      'Jackson', 'Clarke', 'Harris', 'Lewis', 'Turner', 'Cooper', 'Ward', 'Baker', 'Morris',
      'King', 'Hughes', 'Edwards', 'Bailey', 'Cox', 'Fletcher', 'Marshall', 'Barnes', 'Palmer',
      'Chapman', 'Holmes', 'Gibson', 'Reid', 'Hunt', 'Shaw', 'Barker', 'Dawson', 'Fox',
      'Reynolds', 'Ellis', 'Sutton', 'Bennett', 'Hayes', 'Doherty', 'Whitfield', 'Ashworth',
      'Kendall', 'Rowntree', 'Pemberton', 'Hollingworth', 'Beckford', 'Stanton', 'Ainsworth',
      'Crowther', 'Fairhurst', 'Ogden', 'Naylor', 'Tunnicliffe', 'Rimmer', 'Cattermole',
    ],
  },
  Scotland: {
    first: ['Callum', 'Ross', 'Scott', 'Fraser', 'Kieran', 'Lewis', 'Rory', 'Stuart', 'Craig', 'Grant', 'Euan', 'Angus', 'Blair', 'Ruaridh', 'Kyle'],
    last: ['MacDonald', 'Campbell', 'Stewart', 'Fraser', 'Murray', 'Ferguson', 'Douglas', 'Sinclair', 'Cameron', 'Buchanan', 'Kerr', 'Gallacher', 'McTominay', 'Christie', 'Boyle', 'Ramsay'],
  },
  Wales: {
    first: ['Rhys', 'Dylan', 'Owain', 'Gethin', 'Ieuan', 'Morgan', 'Aled', 'Cai', 'Tomos', 'Gareth'],
    last: ['Jones', 'Davies', 'Evans', 'Thomas', 'Williams', 'Morgan', 'Hughes', 'Griffiths', 'Rees', 'Llewellyn', 'Vaughan', 'Pritchard'],
  },
  'Republic of Ireland': {
    first: ['Sean', 'Conor', 'Cian', 'Darragh', 'Eoin', 'Ciaran', 'Padraig', 'Fionn', 'Oisin', 'Ruairi'],
    last: ['Murphy', 'Kelly', 'O’Sullivan', 'Walsh', 'Byrne', 'Ryan', 'O’Brien', 'Doyle', 'McCarthy', 'Gallagher', 'Kavanagh', 'Fitzgerald'],
  },
  'Northern Ireland': {
    first: ['Jordan', 'Shea', 'Trai', 'Caolan', 'Paddy', 'Conor', 'Dale', 'Ethan'],
    last: ['McGinn', 'Magennis', 'Ferguson', 'Bradley', 'Charles', 'Hume', 'Devenny', 'Price'],
  },
  France: {
    first: ['Lucas', 'Hugo', 'Theo', 'Enzo', 'Nathan', 'Mathis', 'Alexandre', 'Kylian', 'Yanis', 'Ibrahim', 'Amine', 'Rayan', 'Malo', 'Noah'],
    last: ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Lefebvre', 'Girard', 'Fontaine', 'Diarra', 'Traore', 'Coulibaly', 'Nkunku', 'Bamba', 'Sissoko', 'Camara'],
  },
  Spain: {
    first: ['Javier', 'Sergio', 'Pablo', 'Alvaro', 'Marcos', 'Iker', 'Hugo', 'Adrian', 'Rodrigo', 'Nico'],
    last: ['Garcia', 'Fernandez', 'Lopez', 'Martinez', 'Sanchez', 'Ramos', 'Torres', 'Navarro', 'Iglesias', 'Serrano', 'Delgado', 'Herrera'],
  },
  Portugal: {
    first: ['Joao', 'Diogo', 'Rafael', 'Tiago', 'Bruno', 'Ruben', 'Goncalo', 'Vitinha', 'Nuno'],
    last: ['Silva', 'Santos', 'Ferreira', 'Costa', 'Pereira', 'Oliveira', 'Carvalho', 'Fonseca', 'Neves', 'Cardoso'],
  },
  Brazil: {
    first: ['Lucas', 'Gabriel', 'Matheus', 'Rafael', 'Bruno', 'Vinicius', 'Joao', 'Pedro', 'Felipe', 'Caio', 'Wesley', 'Endrick'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Lima', 'Ribeiro', 'Almeida', 'Barbosa', 'Cardoso', 'Moraes', 'Vieira'],
  },
  Netherlands: {
    first: ['Daan', 'Sem', 'Lars', 'Bram', 'Jesse', 'Thijs', 'Ruben', 'Stijn', 'Joep', 'Milan'],
    last: ['de Jong', 'van Dijk', 'Bakker', 'Visser', 'de Vries', 'van der Berg', 'Meijer', 'Mulder', 'Hendriks', 'Vermeulen'],
  },
  Germany: {
    first: ['Leon', 'Finn', 'Jonas', 'Luca', 'Noah', 'Elias', 'Maximilian', 'Felix', 'Tim', 'Nico'],
    last: ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Richter', 'Klein'],
  },
  Italy: {
    first: ['Lorenzo', 'Matteo', 'Alessandro', 'Francesco', 'Riccardo', 'Andrea', 'Giacomo', 'Nicolo'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'],
  },
  Denmark: {
    first: ['Mikkel', 'Anders', 'Rasmus', 'Frederik', 'Magnus', 'Oliver', 'Emil', 'Jonas'],
    last: ['Nielsen', 'Jensen', 'Hansen', 'Andersen', 'Pedersen', 'Christensen', 'Larsen', 'Sorensen'],
  },
  Sweden: {
    first: ['Erik', 'Oscar', 'Viktor', 'Anton', 'Hugo', 'Axel', 'Elias', 'Isak'],
    last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson'],
  },
  Norway: {
    first: ['Magnus', 'Jonas', 'Sander', 'Kristian', 'Emil', 'Oskar', 'Henrik'],
    last: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Nilsen', 'Berg', 'Haaland'],
  },
  Nigeria: {
    first: ['Chukwu', 'Emeka', 'Tobi', 'Kelechi', 'Samuel', 'Victor', 'Ademola', 'Ola'],
    last: ['Okafor', 'Adeyemi', 'Nwankwo', 'Balogun', 'Eze', 'Obi', 'Adeleke', 'Onyeka'],
  },
  Ghana: {
    first: ['Kwame', 'Kofi', 'Mohammed', 'Daniel', 'Isaac', 'Abdul', 'Joseph'],
    last: ['Mensah', 'Boateng', 'Owusu', 'Asante', 'Appiah', 'Baffour', 'Amoah'],
  },
  Senegal: {
    first: ['Ibrahima', 'Cheikh', 'Moussa', 'Pape', 'Abdoulaye', 'Lamine'],
    last: ['Diallo', 'Ndiaye', 'Sarr', 'Gueye', 'Faye', 'Sow', 'Ba'],
  },
  Jamaica: {
    first: ['Andre', 'Damion', 'Shamar', 'Leon', 'Dwayne', 'Kemar'],
    last: ['Brown', 'Campbell', 'Bailey', 'Reid', 'Gordon', 'Sterling', 'Morrison'],
  },
  Argentina: {
    first: ['Santiago', 'Mateo', 'Facundo', 'Lautaro', 'Nicolas', 'Julian', 'Tomas'],
    last: ['Gonzalez', 'Rodriguez', 'Fernandez', 'Lopez', 'Martinez', 'Perez', 'Alvarez', 'Romero'],
  },
  Japan: {
    first: ['Kaoru', 'Takumi', 'Sho', 'Ren', 'Yuto', 'Daichi', 'Riku'],
    last: ['Tanaka', 'Suzuki', 'Sato', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi'],
  },
  Poland: {
    first: ['Jakub', 'Kacper', 'Filip', 'Szymon', 'Antoni', 'Bartosz'],
    last: ['Nowak', 'Kowalski', 'Wisniewski', 'Wojcik', 'Kaminski', 'Lewandowski', 'Zielinski'],
  },
  Belgium: {
    first: ['Arthur', 'Louis', 'Victor', 'Jules', 'Lucas', 'Noah'],
    last: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Willems', 'Claes', 'Wouters'],
  },
};

/** Nationality weights for generated English-pyramid players. Mostly domestic, as it should be. */
export const GENERATED_NATIONALITY_WEIGHTS: [string, number][] = [
  ['England', 62], ['Scotland', 5], ['Wales', 4], ['Republic of Ireland', 4], ['Northern Ireland', 2],
  ['France', 3], ['Nigeria', 2.5], ['Ghana', 1.5], ['Netherlands', 2], ['Spain', 2], ['Portugal', 1.5],
  ['Brazil', 1.5], ['Denmark', 1.2], ['Sweden', 1.2], ['Norway', 1], ['Germany', 1.2], ['Italy', 1],
  ['Jamaica', 1], ['Senegal', 1], ['Argentina', 1], ['Japan', 0.8], ['Poland', 1], ['Belgium', 1],
];

/** Sponsors used for shirt, kit and stadium naming deals. Deliberately fictional. */
export const SPONSOR_NAMES = {
  shirt: [
    'Northgate Insurance', 'Kestrel Energy', 'BetHarbour', 'Vantage Telecom', 'Ironbridge Motors',
    'Halcyon Airways', 'Merrick & Sons', 'Pinnacle Logistics', 'Solent Bank', 'Ardent Digital',
    'Crown Row Foods', 'Trueline Windows', 'Verity Health', 'Quayside Brewing', 'Redwing Mobile',
  ],
  kit: [
    'Vantar', 'Stridewell', 'Kappex', 'Meridian Sport', 'Nolta', 'Ardex Athletic', 'Tempora',
    'Bramble & Hyde', 'Oxbow Sportswear',
  ],
  stadium: [
    'Northgate', 'Kestrel', 'Vantage', 'Halcyon', 'Solent', 'Pinnacle', 'Merrick', 'Redwing',
    'Quayside', 'Ardent',
  ],
};

/** Agent surnames, so transfer negotiations have a named counterparty. */
export const AGENT_NAMES = [
  'Devlin', 'Kowalczyk', 'Barros', 'Fenton', 'Aldridge', 'Mancuso', 'Sørlie', 'Okonjo',
  'Whitaker', 'Rasmussen', 'Bellini', 'Chaudhry', 'Novak', 'Traoré', 'Hartmann',
];
