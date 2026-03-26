import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { writeFile, access } from 'fs/promises';
import { join } from 'path';
import { rootDir, text, getDbConfig, mysqlArgs } from '../utils.js';

const SEED_FILE = 'config/seed_init.php';

const LOREM_DESC =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed pharetra posuere leo, at interdum dui congue bibendum. Pellentesque non turpis consectetur, hendrerit ante semper, dapibus arcu. Nunc sem tortor, eleifend in odio at, porttitor ullamcorper velit. Proin quis accumsan tortor. Mauris sed leo sed diam cursus lobortis volutpat in erat. Aenean luctus ac nunc eu sollicitudin. Cras et eleifend lectus. In lobortis ex ac rutrum rutrum. Proin facilisis tempus accumsan. Aliquam ullamcorper molestie dictum. Cras iaculis erat et mi varius porttitor. Praesent eu turpis ut urna vestibulum tristique vitae ullamcorper urna.';

const ARTICLE_SHORT =
    '<p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>';

const ARTICLE_LONG =
    '<p>Lorem ipsum dolor <strong>sit amet</strong>, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut <a href="#">labore et dolore magna</a> aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p><p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>';

const FAQ_DESC =
    '<p>Odpoveď na túto otázku nájdete v podrobnom sprievodcovi nižšie. Pre ďalšie informácie nás neváhajte kontaktovať prostredníctvom formulára alebo telefonicky.</p>';

// ── Shared dummy data ─────────────────────────────────────────────────────────

const DUMMY_BRANCHES = Array.from({ length: 24 }, (_, i) => ({
    name: `TEST Predajňa ${i + 1} (nepublikovať)`,
    city: 'Testovo',
    street: `Testovacia ulica ${i + 1}`,
    post_code: '00001',
    email: 'test@test.test',
    phone: '+421 000 000 000',
    description: '<p>TESTOVACIA POBOČKA — vyplňte reálne údaje pred spustením.</p>',
}));

// ── Eshop type data (all Slovak) ─────────────────────────────────────────────

const ESHOP_TYPES = {
    food: {
        label: 'Potraviny (food)',
        manufacturers: ['Rajo', 'Tatranky', 'Sedita', 'Hamé', 'Podravka', 'Excelent', 'Coop', 'Vitana', 'Dr. Oetker', 'Heinz', 'Bonduelle', "Kellogg's", 'Nestlé', 'Danone', 'Müller', 'Meggle', 'McCain', 'Iglo', 'Hortex', 'Unilever', 'Tesco Value', 'Clever', 'Natura', 'Liptov'],
        productTypes: [
            { name: 'Čerstvé potraviny', groups: [{ name: 'Pekárske výrobky' }, { name: 'Mliečne výrobky' }] },
            { name: 'Balené potraviny', groups: [{ name: 'Konzervy' }, { name: 'Cestoviny a ryža' }] },
            { name: 'Nápoje', groups: [{ name: 'Nealkoholické' }, { name: 'Džúsy' }] },
        ],
        productTypeUnits: ['g', 'kg', 'ml', 'l', 'ks', 'bal'],
        properties: [
            { name: 'Hmotnosť', type: 'decimal' },
            { name: 'Objem', type: 'decimal' },
            { name: 'Alergény', type: 'select' },
            { name: 'Bio', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 3, value: 'Lepok' },
            { property_id: 3, value: 'Laktóza' },
            { property_id: 3, value: 'Orechy' },
            { property_id: 3, value: 'Vajcia' },
        ],
        categories: [
            { name: 'Pekáreň a cukráreň', menu_name: 'Pekáreň', sub: [{ name: 'Chlieb' }, { name: 'Pečivo' }, { name: 'Sladké pečivo' }, { name: 'Torty a zákusky' }] },
            { name: 'Mliečne výrobky a vajcia', menu_name: 'Mliečne', sub: [{ name: 'Syry' }, { name: 'Jogurty' }, { name: 'Maslo a smotana' }] },
            { name: 'Ovocie', menu_name: 'Ovocie', sub: [{ name: 'Čerstvé ovocie' }, { name: 'Sušené ovocie' }] },
            { name: 'Zelenina', menu_name: 'Zelenina', sub: [{ name: 'Čerstvá zelenina' }, { name: 'Mrazená zelenina' }] },
            { name: 'Mäso, údeniny a ryby', menu_name: 'Mäso', sub: [{ name: 'Hovädzie' }, { name: 'Bravčové' }, { name: 'Ryby a morské plody' }, { name: 'Údeniny a klobásy' }] },
            { name: 'Nápoje', menu_name: 'Nápoje', sub: [{ name: 'Voda' }, { name: 'Minerálna voda' }, { name: 'Džúsy' }, { name: 'Limonády' }, { name: 'Energetické nápoje' }, { name: 'Čaje a bylinkové nálevy' }, { name: 'Káva a kakao' }, { name: 'Rastlinné nápoje' }, { name: 'Smoothie a koktaily' }, { name: 'Sirupy a koncentráty' }, { name: 'Pivo a cider' }] },
            { name: 'Trvanlivé potraviny a špeciality pre náročných gurmánov', menu_name: 'Trvanlivé', sub: [{ name: 'Konzervy' }, { name: 'Cestoviny' }, { name: 'Oleje a octy' }] },
            { name: 'Mrazené výrobky', menu_name: 'Mrazené', sub: [{ name: 'Mrazená zelenina' }, { name: 'Mrazené jedlá' }] },
            { name: 'Snacky a pochutiny', menu_name: 'Snacky', sub: [{ name: 'Čipsy' }, { name: 'Oriešky' }, { name: 'Sušienky' }] },
            { name: 'Bio a zdravá výživa', menu_name: 'Bio', sub: [{ name: 'Bio ovocie' }, { name: 'Bio mliečne' }, { name: 'Superfoods' }] },
            { name: 'Detská výživa a dojčenské potreby pre najmenších', menu_name: 'Detská výživa', sub: [] },
            { name: 'Hotové jedlá a polotovary', menu_name: 'Hotové jedlá', sub: [{ name: 'Polievky' }, { name: 'Hlavné jedlá' }] },
            { name: 'Cukrovinky a čokoláda', menu_name: 'Cukrovinky', sub: [{ name: 'Čokolády' }, { name: 'Cukríky' }, { name: 'Žuvačky' }] },
            { name: 'Káva, čaj a kakao', menu_name: 'Káva a čaj', sub: [{ name: 'Zrnková káva' }, { name: 'Instantná káva' }, { name: 'Bylinkové čaje' }, { name: 'Kakao a horúca čokoláda' }] },
            { name: 'Koreniny, omáčky a dochucovadlá', menu_name: 'Koreniny', sub: [{ name: 'Koreniny a bylinky' }, { name: 'Omáčky a kečupy' }, { name: 'Horčice a majonézy' }] },
            { name: 'Oleje, octy a dresingy', menu_name: 'Oleje a octy', sub: [{ name: 'Olivové oleje' }, { name: 'Slnečnicové oleje' }, { name: 'Octy' }] },
            { name: 'Pečenie a dezerty', menu_name: 'Pečenie', sub: [{ name: 'Múky a kvasnice' }, { name: 'Prášky do pečiva' }, { name: 'Cukry a sladidlá' }] },
            { name: 'Bezlepkové a špeciálne diéty', menu_name: 'Bezlepkové', sub: [{ name: 'Bezlepkový chlieb' }, { name: 'Bezlepkové cestoviny' }] },
            { name: 'Vegánske a rastlinné produkty', menu_name: 'Vegánske', sub: [{ name: 'Rastlinné mlieka' }, { name: 'Tofu a tempeh' }, { name: 'Vegánske pochutiny' }] },
            { name: 'Doplnky stravy a vitamíny', menu_name: 'Doplnky stravy', sub: [{ name: 'Vitamíny' }, { name: 'Minerály' }, { name: 'Proteíny' }] },
            { name: 'Darčekové koše a balíčky', menu_name: 'Darčekové koše', sub: [] },
        ],
        productAdj: ['Čerstvý', 'Bio', 'Domáci', 'Prírodný', 'Tradičný', 'Jemný', 'Zdravý', 'Plnotučný', 'Kompletný ekologicky certifikovaný bezlepkový'],
        productNoun: ['jogurt', 'syr', 'chlieb', 'mlieko', 'maslo', 'džús', 'müsli', 'granola', 'multivitamínový nápoj so stopovými prvkami'],
        productExtra: ['bez laktózy', 'so semienkami', 'celozrnný', 's ovocím', 'nízkotučný', 'prémiový', '500g', '1kg', 's prírodným kvasením a dlhou trvanlivosťou bez konzervantov'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Recepty', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Zdravý životný štýl', parent_id: 4 },
            { id: 8, name: 'Bio a ekológia', parent_id: 4 },
            { id: 9, name: 'Sezónne tipy', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Informácie o doručení', parent_id: 3 },
            { id: 12, name: 'Časté otázky', parent_id: 1 },
            { id: 13, name: 'Kariéra', parent_id: 1 },
            { id: 14, name: 'Tlačové správy', parent_id: 1 },
            { id: 15, name: 'Partneri', parent_id: 1 },
            { id: 16, name: 'Výživové poradenstvo', parent_id: 4 },
            { id: 17, name: 'Lokálni výrobcovia', parent_id: 4 },
            { id: 18, name: 'Vegánstvo a vegetariánstvo', parent_id: 4 },
            { id: 19, name: 'Detská výživa', parent_id: 4 },
            { id: 20, name: 'Špeciálne diéty', parent_id: 4 },
            { id: 21, name: 'Rozhovory s odborníkmi', parent_id: 4 },
            { id: 22, name: 'Videorecepty', parent_id: 5 },
            { id: 23, name: 'Desiatové tipy', parent_id: 5 },
            { id: 24, name: 'Víkendové varenie', parent_id: 5 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Sezónne recepty na jar a leto', section_id: 5 },
            { id: 5, name: 'Zdravé raňajky', section_id: 5 },
            { id: 6, name: 'Čo jesť pred a po tréningu', section_id: 7 },
            { id: 7, name: 'Novinky v sortimente', section_id: 6 },
            { id: 8, name: 'Bio produkty — čo treba vedieť', section_id: 8 },
            { id: 9, name: 'Kompletný sprievodca výberom a skladovaním potravín', section_id: 5 },
            { id: 10, name: 'Fermentované potraviny a ich vplyv na zdravie', section_id: 7 },
            { id: 11, name: 'Sezónna zelenina — čo kupovať v zimnom období', section_id: 9 },
            { id: 12, name: 'Tipy na rýchlu večeru z dostupných ingrediencií', section_id: 5 },
            { id: 13, name: 'Ako správne skladovať ovocie a zeleninu', section_id: 7 },
            { id: 14, name: 'Vegánska strava — ako začať', section_id: 18 },
            { id: 15, name: 'Bezlepková diéta krok za krokom', section_id: 20 },
            { id: 16, name: 'Nové produkty v bio sortimente', section_id: 6 },
            { id: 17, name: 'Jarné recepty s lokálnou zeleninou', section_id: 5 },
            { id: 18, name: 'Rýchle obedy pre pracujúcich', section_id: 5 },
            { id: 19, name: 'Detská výživa — čo patrí na tanier', section_id: 19 },
            { id: 20, name: 'Trendy v zdravom stravovaní 2024', section_id: 7 },
            { id: 21, name: 'Adventné recepty a sviatočné jedlá', section_id: 9 },
            { id: 22, name: 'Medzinárodná kuchyňa doma', section_id: 5 },
            { id: 23, name: 'Smoothie a zdravé nápoje', section_id: 7 },
            { id: 24, name: 'Nakupovanie potravín online — výhody a nevýhody', section_id: 6 },
            { id: 25, name: 'Superfoods — fakty vs. mýty', section_id: 8 },
            { id: 26, name: 'Lokálni výrobcovia — prečo ich podporiť', section_id: 17 },
        ],
        faqSections: [
            { name: 'Objednávky a platby' },
            { name: 'Doprava a doručenie' },
            { name: 'Reklamácie a vrátenie tovaru' },
            { name: 'Čerstvosť a skladovanie potravín' },
            { name: 'Bio a ekologické produkty' },
            { name: 'Alergény a špeciálne diéty' },
            { name: 'Vernostný program' },
            { name: 'Darčekové poukazy a balenie' },
            { name: 'Zákaznícky servis' },
            { name: 'Mobilná aplikácia' },
            { name: 'Firemné objednávky' },
            { name: 'Akcie a zľavy' },
            { name: 'Bezpečnosť a kvalita' },
            { name: 'Predplatné a pravidelné objednávky' },
            { name: 'Platba na splátky' },
            { name: 'Vracanie a reklamácia ovocia a zeleniny' },
            { name: 'Doručenie do zahraničia' },
            { name: 'Zloženie a nutričné hodnoty' },
            { name: 'Eko a udržateľnosť' },
            { name: 'Tehotenstvo a dojčenie' },
            { name: 'Detská výživa' },
            { name: 'Špeciálne požiadavky' },
            { name: 'Obaly a balenie' },
            { name: 'Výhody členstva' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Ako môžem zaplatiť za objednávku?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Môžem zmeniť objednávku po jej odoslaní?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Ako dlho trvá doručenie?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Doručujete aj cez víkend?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Aká je minimálna objednávka pre doručenie zadarmo?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Ako reklamovať poškodený tovar?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Do kedy môžem vrátiť tovar?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako správne skladovať čerstvé potraviny po doručení?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako dlho vydržia čerstvé potraviny po doručení?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Ako spoznám certifikované bio výrobky?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Čo znamená označenie EU bio certifikát?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Kde nájdem informácie o alergénoch?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Máte bezlepkové produkty?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Ako sa zapojím do vernostného programu?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Kedy mi body z objednávky pripíšu?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Ako objednať darčekový poukaz?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Je možné zaobaliť objednávku ako darček?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Ako sa môžem spojiť so zákazníckym servisom?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'V akých hodinách je zákaznícky servis dostupný?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Je k dispozícii mobilná aplikácia?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Je možné zadať firemnú objednávku s faktúrou?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Ako získam zľavový kód?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Dajú sa kombinovať zľavové kódy?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Čerstvé každý deň', description: '<p>Denná dodávka čerstvých potravín priamo od výrobcov.</p>' },
            { id: 2, name: 'Rýchle doručenie', description: '<p>Doručenie do 24 hodín pri objednávke do 12:00.</p>' },
            { id: 3, name: 'Bezpečné platby', description: '<p>Platba kartou, prevodom alebo dobierkou.</p>' },
            { id: 4, name: 'Vrátenie do 14 dní', description: '<p>Vrátenie tovaru bez udania dôvodu do 14 dní.</p>' },
            { id: 5, name: 'Certifikované bio produkty', description: '<p>Všetky bio výrobky majú platný európsky certifikát.</p>' },
            { id: 6, name: 'Široký výber', description: '<p>Viac ako 10 000 produktov v ponuke.</p>' },
            { id: 7, name: 'Vernostný program', description: '<p>Zbierajte body a získajte zľavy na ďalší nákup.</p>' },
            { id: 8, name: 'Zákaznícka podpora', description: '<p>Sme k dispozícii každý pracovný deň 8:00–18:00.</p>' },
            { id: 9, name: 'Ekologické balenie', description: '<p>Používame recyklovateľné a ekologické obaly.</p>' },
            { id: 10, name: 'Lokálni výrobcovia', description: '<p>Podporujeme slovenských a lokálnych producentov.</p>' },
            { id: 11, name: 'Sezónne akcie', description: '<p>Pravidelné zľavy a špeciálne ponuky každý týždeň.</p>' },
            { id: 12, name: 'Darčekové balenie', description: '<p>Môžeme váš nákup pekne zabaliť ako darček.</p>' },
            { id: 13, name: 'Bez konzervantov', description: '<p>Ponúkame výrobky bez umelých konzervantov.</p>' },
            { id: 14, name: 'Čerstvé pečivo', description: '<p>Každý deň čerstvé pečivo od lokálnych pekárov.</p>' },
            { id: 15, name: 'Bezpečné potraviny', description: '<p>Pravidelná kontrola kvality všetkých produktov.</p>' },
            { id: 16, name: 'Expresné doručenie', description: '<p>Objednávky do 2 hodín v rámci mesta.</p>' },
            { id: 17, name: 'Bez GMO', description: '<p>Všetky produkty sú bez geneticky modifikovaných organizmov.</p>' },
            { id: 18, name: 'Odborné poradenstvo', description: '<p>Naši výživoví poradcovia vám radi poradia.</p>' },
            { id: 19, name: 'Cashback program', description: '<p>Vrátime 5 % z každého nákupu vo forme kreditu.</p>' },
            { id: 20, name: 'Predplatné s úsporou', description: '<p>Predplaťte si pravidelné dodávky a ušetrite 10 %.</p>' },
            { id: 21, name: 'Vegánske možnosti', description: '<p>Bohaté vegánske a rastlinné alternatívy v ponuke.</p>' },
            { id: 22, name: 'Bezlepkový sortiment', description: '<p>Rozsiahly výber bezlepkových výrobkov.</p>' },
            { id: 23, name: 'Detské potraviny', description: '<p>Špeciálna sekcia pre dojčenské a detské potraviny.</p>' },
            { id: 24, name: 'Sezónny výber', description: '<p>Každú sezónu nové produkty priamo od pestovateľov.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Marta Kováčová', description: '<p>Čerstvé potraviny doručené priamo domov — úžasná služba, odporúčam každému!</p>' },
            { id: 2, name: 'Jozef Novák', description: '<p>Bio produkty sú skutočne kvalitné a ceny sú veľmi príjemné.</p>' },
            { id: 3, name: 'Alžbeta Horváthová', description: '<p>Dojčenské potraviny vždy čerstvé a doručené včas. Ďakujem!</p>' },
            { id: 4, name: 'Rastislav Šimko', description: '<p>Skvelý výber lokálnych produktov. Moje jedlá sú oveľa lepšie vďaka čerstvým surovinám.</p>' },
            { id: 5, name: 'Katarína Blahová', description: '<p>Proteínové a zdravé produkty vždy skladom. Veľká spokojnosť!</p>' },
            { id: 6, name: 'Martin Oravec', description: '<p>Objednávka prišla do 24 hodín. Perfektné balenie a čerstvosť.</p>' },
            { id: 7, name: 'Eva Kráľová', description: '<p>Najlepší online obchod s potravinami na Slovensku. Vždy sa vrátim!</p>' },
            { id: 8, name: 'Tomáš Bendík', description: '<p>Bezlepkový sortiment je výborný — naša dcéra je konečne spokojná.</p>' },
            { id: 9, name: 'Lucia Mináčová', description: '<p>Rastlinné alternatívy sú na výber — nikde inde som nenašla taký výber.</p>' },
            { id: 10, name: 'Peter Jakubec', description: '<p>Cashback program je super, ušetril som už desiatky eur.</p>' },
            { id: 11, name: 'Zuzana Filipová', description: '<p>Vernostný program je výborný. Nakupujem tu každý týždeň.</p>' },
            { id: 12, name: 'Roman Gábriš', description: '<p>Ekologické balenie je skvelá iniciatíva. Oceňujem zodpovedný prístup.</p>' },
            { id: 13, name: 'Helena Baranová', description: '<p>Zákaznícka podpora mi vždy ochotne pomohla s objednávkou.</p>' },
            { id: 14, name: 'Marek Polák', description: '<p>Lokálni výrobcovia, skvelá kvalita. Podporujem Slovensko!</p>' },
            { id: 15, name: 'Ivana Horáková', description: '<p>Vrátenie tovaru prebehlo bez akýchkoľvek problémov. Profesionálny prístup.</p>' },
            { id: 16, name: 'Stanislav Vlček', description: '<p>Sezónne akcie sú fantastické — vždy nájdem niečo za skvelú cenu.</p>' },
            { id: 17, name: 'Monika Chovanová', description: '<p>Kvalita produktov prevyšuje očakávania. Nakupujem tu už 2 roky.</p>' },
            { id: 18, name: 'Ondrej Varga', description: '<p>Rýchle doručenie a prehľadný e-shop. Odporúčam priateľom.</p>' },
            { id: 19, name: 'Barbora Sedláčková', description: '<p>Darčekové balenie je krásne — ideálny darček pre babičku.</p>' },
            { id: 20, name: 'Vladimír Mešťan', description: '<p>Produkty bez GMO a bez konzervantov. Konečne zdravé nakupovanie!</p>' },
            { id: 21, name: 'Silvia Nagyová', description: '<p>Predplatné s úsporou je geniálna vec. Šetrím čas aj peniaze.</p>' },
            { id: 22, name: 'Dušan Krúpa', description: '<p>Čerstvé pečivo každý deň je pre nás rodinu absolútna paráda.</p>' },
            { id: 23, name: 'Renáta Molnárová', description: '<p>Odborné výživové poradenstvo mi veľmi pomohlo s výberom produktov.</p>' },
            { id: 24, name: 'Miroslav Lukáč', description: '<p>Bezpečné platby a jednoduchý nákupný proces. Skvelý e-shop!</p>' },
        ],
    },

    toys: {
        label: 'Hračky (toys)',
        manufacturers: ['Lego', 'Mattel Slovakia', 'Hasbro', 'Alltoys', 'Bburago', 'Clementoni', 'Ravensburger', 'Playmobil', 'Fisher-Price', 'Funko', 'Schleich', 'BRUDER', 'Mega Construx', 'Spin Master', 'VTech', 'LeapFrog', "K'Nex", 'Bandai', 'Tomy', 'Learning Resources', 'HABA', 'PlanToys', 'Thames & Kosmos', 'Melissa & Doug'],
        productTypes: [
            { name: 'Vonkajšie hračky', groups: [{ name: 'Jazdidlá' }, { name: 'Šport a záhrada' }] },
            { name: 'Vnútorné hračky', groups: [{ name: 'Figúrky' }, { name: 'Bábiky' }] },
            { name: 'Vzdelávacie hračky', groups: [{ name: 'Skladačky' }, { name: 'Spoločenské hry' }] },
        ],
        productTypeUnits: ['ks', 'sada', 'bal', 'cm'],
        properties: [
            { name: 'Vek (od)', type: 'decimal' },
            { name: 'Materiál', type: 'select' },
            { name: 'Rozmery', type: 'decimal' },
            { name: 'Batérie potrebné', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 2, value: 'Plast' },
            { property_id: 2, value: 'Drevo' },
            { property_id: 2, value: 'Plyš' },
            { property_id: 2, value: 'Kov' },
        ],
        categories: [
            { name: 'Akčné figúrky a zberateľské predmety', menu_name: 'Akčné figúrky', sub: [{ name: 'Superhrdinovia' }, { name: 'Vojaci' }, { name: 'Anime figúrky' }] },
            { name: 'Spoločenské hry', menu_name: 'Spoločenské hry', sub: [{ name: 'Rodinné hry' }, { name: 'Kartové hry' }, { name: 'Strategické hry' }, { name: 'Párty hry' }, { name: 'Slovné hry' }, { name: 'Detektívne hry' }, { name: 'Kooperatívne hry' }, { name: 'Trivia a vedomostné kvízy' }, { name: 'Abstraktné hry' }, { name: 'Dexteritné hry' }, { name: 'Ekonomické a obchodné hry' }] },
            { name: 'Vzdelávacie a kreatívne hračky', menu_name: 'Vzdelávacie', sub: [{ name: 'Skladačky' }, { name: 'Puzzle' }, { name: 'Maľovanie a keramika' }] },
            { name: 'Vonkajšie hračky', menu_name: 'Vonkajšie', sub: [{ name: 'Kolobežky' }, { name: 'Bicykle' }, { name: 'Vodné hračky' }, { name: 'Trampolíny' }] },
            { name: 'Bábätká a najmenší', menu_name: 'Bábätká', sub: [{ name: 'Hryzadlá' }, { name: 'Plyšové hračky' }] },
            { name: 'Elektronické a interaktívne hračky', menu_name: 'Elektronické', sub: [{ name: 'Diaľkovo ovládané' }, { name: 'Interaktívne' }, { name: 'Robotika' }] },
            { name: 'Stavebnice a konštrukčné sady', menu_name: 'Stavebnice', sub: [{ name: 'LEGO sety' }, { name: 'Magnetické stavebnice' }] },
            { name: 'Bábiky a príslušenstvo', menu_name: 'Bábiky', sub: [{ name: 'Módne bábiky' }, { name: 'Bábiky pre bábätká' }, { name: 'Domčeky pre bábiky' }] },
            { name: 'Športové a pohybové hračky', menu_name: 'Šport', sub: [{ name: 'Lopty' }, { name: 'Náradia a výbava' }] },
            { name: 'Autíčka a modely dopravných prostriedkov', menu_name: 'Autíčka', sub: [{ name: 'RC autíčka' }, { name: 'Modely áut' }, { name: 'Vlaky a vláčiky' }] },
            { name: 'Kreatívne súpravy pre deti a mládež — šijeme, maľujeme, tvoríme', menu_name: 'Kreativita', sub: [] },
            { name: 'Výpredaj a špeciálne ponuky', menu_name: 'Výpredaj', sub: [] },
            { name: 'Experimentálne a vedecké súpravy', menu_name: 'Veda a pokusy', sub: [{ name: 'Chémia a fyzika' }, { name: 'Prírodoveda' }] },
            { name: 'Hudobné hračky a nástroje', menu_name: 'Hudobné hračky', sub: [{ name: 'Detské nástroje' }, { name: 'Hudobné hračky pre bábätká' }] },
            { name: 'Kariérne a rolové hračky', menu_name: 'Rolové hry', sub: [{ name: 'Lekárske súpravy' }, { name: 'Kuchynky' }, { name: 'Náradia a dielne' }] },
            { name: 'Hračky pre domácich miláčikov a farmu', menu_name: 'Farma a zvieratá', sub: [{ name: 'Zvieratká' }, { name: 'Stajne a farmy' }] },
            { name: 'Dizajnové a prémiové hračky', menu_name: 'Prémiové', sub: [{ name: 'Zberateľské sety' }, { name: 'Limitované edície' }] },
            { name: 'Sezónne hračky a novinky', menu_name: 'Sezónne', sub: [{ name: 'Letné hračky' }, { name: 'Zimné hračky' }] },
            { name: 'Puzzle a logické hry', menu_name: 'Puzzle', sub: [{ name: '3D puzzle' }, { name: 'Detské puzzle' }, { name: 'Puzzle pre dospelých' }] },
            { name: 'Hračky podľa filmov a seriálov', menu_name: 'Licencie', sub: [{ name: 'Marvel a DC' }, { name: 'Disney a Pixar' }, { name: 'Star Wars' }] },
            { name: 'Hrady, koľajnice a veľké stavebnice', menu_name: 'Veľké sety', sub: [{ name: 'Hrady a pevnosti' }, { name: 'Koľajnicové trate' }] },
            { name: 'Aktívne hračky a záhrada', menu_name: 'Záhradné hračky', sub: [{ name: 'Pieskoviská' }, { name: 'Záhradné sprchy' }] },
        ],
        productAdj: ['Interaktívny', 'Kreatívny', 'Farebný', 'Magický', 'Zábavný', 'Vzdelávací', 'Mega', 'Maxi', 'Multifunkčný elektronický vzdelávací'],
        productNoun: ['robot', 'auto', 'bábika', 'stavebnica', 'puzzle', 'hra', 'vlak', 'lietadlo', 'interaktívna edukačná sada so zvukmi a svetlami'],
        productExtra: ['pre deti od 3 rokov', 'so zvukmi', 'so svetlami', '3v1', 'deluxe edícia', 'XL', 'pre celú rodinu', 's náhradnými dielmi a zárukou 2 roky'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Tipy na darčeky', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Vzdelávanie hrou', parent_id: 4 },
            { id: 8, name: 'Bezpečnosť', parent_id: 4 },
            { id: 9, name: 'Recenzie hračiek', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Dopravné podmienky', parent_id: 3 },
            { id: 12, name: 'Časté otázky', parent_id: 1 },
            { id: 13, name: 'Vianočné tipy', parent_id: 5 },
            { id: 14, name: 'Narodeninové tipy', parent_id: 5 },
            { id: 15, name: 'Partnerské školy', parent_id: 1 },
            { id: 16, name: 'STEM a robotika', parent_id: 7 },
            { id: 17, name: 'Tvorivé dielne', parent_id: 7 },
            { id: 18, name: 'Vonkajšie aktivity', parent_id: 7 },
            { id: 19, name: 'Hry pre celú rodinu', parent_id: 4 },
            { id: 20, name: 'Sezónne novinky', parent_id: 6 },
            { id: 21, name: 'Testovanie produktov', parent_id: 9 },
            { id: 22, name: 'Top 10 hračiek', parent_id: 9 },
            { id: 23, name: 'Ekologické hračky', parent_id: 4 },
            { id: 24, name: 'Špeciálne potreby', parent_id: 4 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Top darčeky na Vianoce', section_id: 5 },
            { id: 5, name: 'Hračky roka 2024', section_id: 9 },
            { id: 6, name: 'Bezpečnosť hračiek — na čo si dať pozor', section_id: 8 },
            { id: 7, name: 'Novinky v sortimente', section_id: 6 },
            { id: 8, name: 'Rozvíjajúce hračky pre predškolákov', section_id: 7 },
            { id: 9, name: 'Kompletný sprievodca výberom hračiek podľa veku dieťaťa', section_id: 5 },
            { id: 10, name: 'Ekologické hračky — trendy 2024', section_id: 23 },
            { id: 11, name: 'STEM hračky a vzdelávanie hrou', section_id: 16 },
            { id: 12, name: 'Darčekové tipy pre deti od 1 do 12 rokov', section_id: 5 },
            { id: 13, name: 'Ako vybrať hračku pre bábätko', section_id: 5 },
            { id: 14, name: 'Spoločenské hry pre celú rodinu', section_id: 19 },
            { id: 15, name: 'Robotika pre deti — kde začať', section_id: 16 },
            { id: 16, name: 'Najlepšie vonkajšie hračky na leto', section_id: 18 },
            { id: 17, name: 'Kreatívne tvorivé sady pre školákov', section_id: 17 },
            { id: 18, name: 'Darčeky na narodeniny pre dievčatá', section_id: 14 },
            { id: 19, name: 'Darčeky na narodeniny pre chlapcov', section_id: 14 },
            { id: 20, name: 'Puzzle — zábava pre všetky vekové kategórie', section_id: 19 },
            { id: 21, name: 'Vianočné darčeky do 20 eur', section_id: 13 },
            { id: 22, name: 'Novinky z veľtrhu hračiek 2024', section_id: 20 },
            { id: 23, name: 'Hračky pre deti so špeciálnymi potrebami', section_id: 24 },
            { id: 24, name: 'Recyklovateľné hračky — prehľad trhu', section_id: 23 },
            { id: 25, name: 'Najlepšie LEGO sety tohto roka', section_id: 22 },
            { id: 26, name: 'Ako správne čistiť a skladovať hračky', section_id: 8 },
        ],
        faqSections: [
            { name: 'Objednávky a platby' },
            { name: 'Bezpečnosť hračiek' },
            { name: 'Vekové odporúčania' },
            { name: 'Záruka a servis' },
            { name: 'Darčekové balenie' },
            { name: 'Vrátenie tovaru' },
            { name: 'Certifikácia a normy' },
            { name: 'Doručenie' },
            { name: 'STEM a vzdelávacie hračky' },
            { name: 'Licencované produkty' },
            { name: 'Stavebnice a sady' },
            { name: 'Vonkajšie hračky' },
            { name: 'Zákaznícky servis' },
            { name: 'Ekologické hračky' },
            { name: 'Spoločenské hry' },
            { name: 'Elektronické hračky' },
            { name: 'Zberateľské predmety' },
            { name: 'Skladovanie a údržba' },
            { name: 'Vernostný program' },
            { name: 'Akcie a výpredaj' },
            { name: 'Špeciálne potreby' },
            { name: 'Montáž a bezpečnosť' },
            { name: 'Firemné objednávky' },
            { name: 'Predplatné' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Ako môžem zaplatiť za objednávku?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Môžem zmeniť objednávku po jej odoslaní?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Sú všetky hračky certifikované?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Čo znamená značka CE na hračke?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Ako zvoliť správnu hračku podľa veku?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Sú niektoré hračky nevhodné pre deti do 3 rokov?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako dlho trvá záručná oprava?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Kde môžem uplatniť záruku na hračku?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Je možné zaobaliť hračku ako darček?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Ponúkate darčekové poukazy?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Do kedy môžem vrátiť tovar?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Čo ak dostaneme poškodenú hračku?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Čo znamená certifikácia EN 71?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Ako dlho trvá doručenie?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Doručujete aj do zahraničia?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Aké sú výhody STEM hračiek pre deti?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Ako sa líšia originálne a neoriginálne licenčné hračky?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Dajú sa dokupovať diely k stavebniciam?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Sú vonkajšie hračky vhodné na dážď?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Ako sa môžem spojiť so zákazníckym servisom?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Vyrábajú sa hračky z recyklovaných materiálov?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Koľko hráčov potrebujú spoločenské hry?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Aké batérie potrebujú elektronické hračky?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'Kde môžem nájsť vzácne zberateľské kúsky?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Bezpečné hračky', description: '<p>Všetky hračky spĺňajú európske bezpečnostné normy CE.</p>' },
            { id: 2, name: 'Odborný výber', description: '<p>Hračky vyberá tím pedagógov a odborníkov na vývoj dieťaťa.</p>' },
            { id: 3, name: 'Darčekové balenie', description: '<p>Každú hračku zabalíme ako darček zadarmo.</p>' },
            { id: 4, name: 'Vrátenie do 30 dní', description: '<p>Vrátenie nepoužitého tovaru do 30 dní bez problémov.</p>' },
            { id: 5, name: 'Doprava zadarmo', description: '<p>Doprava zadarmo pri objednávke nad 50 €.</p>' },
            { id: 6, name: 'Vekové odporúčania', description: '<p>Každá hračka má jasné vekové odporúčanie.</p>' },
            { id: 7, name: 'Vernostný program', description: '<p>Zbierajte body za každý nákup a získajte odmeny.</p>' },
            { id: 8, name: 'Rýchle doručenie', description: '<p>Doručenie do 48 hodín pri objednávke do 14:00.</p>' },
            { id: 9, name: 'Ekologické hračky', description: '<p>Rastúci sortiment ekologických a udržateľných hračiek.</p>' },
            { id: 10, name: 'Zákaznícka podpora', description: '<p>Poradíme vám s výberom každý deň 8:00–20:00.</p>' },
            { id: 11, name: 'STEM hračky', description: '<p>Špeciálna sekcia vzdelávacích STEM hračiek.</p>' },
            { id: 12, name: 'Originálne produkty', description: '<p>Iba originálne, autorizované produkty od výrobcov.</p>' },
            { id: 13, name: 'Záruka 2 roky', description: '<p>Na všetky hračky poskytujeme záruku 2 roky.</p>' },
            { id: 14, name: 'Vianočné akcie', description: '<p>Špeciálne zľavy a balíčky počas sviatočného obdobia.</p>' },
            { id: 15, name: 'Click & Collect', description: '<p>Objednajte online a vyzdvihnite v predajni.</p>' },
            { id: 16, name: 'Exkluzívne sety', description: '<p>Špeciálne sety dostupné len v našom obchode.</p>' },
            { id: 17, name: 'Odporúčania pedagógov', description: '<p>Spolupracujeme s učiteľmi materských škôl.</p>' },
            { id: 18, name: 'Bezpečné platby', description: '<p>Šifrované platby kartou, PayPal a prevodom.</p>' },
            { id: 19, name: 'Zberateľské edície', description: '<p>Limitované zberateľské edície obľúbených sérií.</p>' },
            { id: 20, name: 'Montáž pre väčšie hračky', description: '<p>Pomôžeme vám so zostavením väčšej hračky.</p>' },
            { id: 21, name: 'Inšpirácia na darček', description: '<p>Náš sprievodca darčekmi vám pomôže vybrať ten správny.</p>' },
            { id: 22, name: 'Bezpečný nákup', description: '<p>Overený obchod s tisíckami spokojných zákazníkov.</p>' },
            { id: 23, name: 'Náhradné diely', description: '<p>Dostupné náhradné diely pre vybrané stavebnice.</p>' },
            { id: 24, name: 'Hračky pre špeciálne potreby', description: '<p>Špeciálna ponuka hračiek pre deti so špeciálnymi potrebami.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Jana Krajčíová', description: '<p>Moje deti sú nadšené! Hračky sú bezpečné a kvalitné. Ďakujem!</p>' },
            { id: 2, name: 'Peter Záhradník', description: '<p>Darčekové balenie bolo nádherné — syn bol úplne ohromený.</p>' },
            { id: 3, name: 'Veronika Tóthová', description: '<p>Odborný výber hračiek mi veľmi pomohol — presne vedeli, čo odporučiť 3-ročnému dieťaťu.</p>' },
            { id: 4, name: 'Ladislav Červenák', description: '<p>Doprava zadarmo a rýchle doručenie. Stavebnica dorazila celá a nepoškodená.</p>' },
            { id: 5, name: 'Petra Mazánková', description: '<p>STEM hračky sú skvelé — deti sa hrajú a zároveň sa učia.</p>' },
            { id: 6, name: 'Michal Sloboda', description: '<p>Vrátenie do 30 dní bez otázok — veľmi profesionálny prístup.</p>' },
            { id: 7, name: 'Andrea Lukáčová', description: '<p>Ekologické hračky sú super nápad. Oceňujem zodpovedný prístup k prírode.</p>' },
            { id: 8, name: 'Tibor Kováč', description: '<p>Záruka 2 roky a originálne produkty — nákup bez obáv.</p>' },
            { id: 9, name: 'Natália Blaho', description: '<p>Hračky pre špeciálne potreby — nakoniec som našla niečo vhodné pre syna.</p>' },
            { id: 10, name: 'Radoslav Novotný', description: '<p>Vernostný program je výborný. Zbierám body a dostávam odmeny.</p>' },
            { id: 11, name: 'Denisa Pálková', description: '<p>Zákaznícka podpora mi pomohla vybrať správnu hračku pre vek dieťaťa.</p>' },
            { id: 12, name: 'Igor Halás', description: '<p>Zberateľské edície LEGO sú dostupné len tu. Skvelý výber!</p>' },
            { id: 13, name: 'Mária Benková', description: '<p>Jednoduché objednávanie a rýchle doručenie. Vnúčatá boli nadšené.</p>' },
            { id: 14, name: 'Juraj Fedorčák', description: '<p>Montáž väčšej hračky zadarmo — výborná služba navyše.</p>' },
            { id: 15, name: 'Soňa Miková', description: '<p>Click & Collect funguje perfektne — vyzdvihla som darček v deň objednávky.</p>' },
            { id: 16, name: 'Branislav Horný', description: '<p>Exkluzívne sety dostupné len tu. Syn bol z darčeka úplne nadšený.</p>' },
            { id: 17, name: 'Tatiana Štefanová', description: '<p>Vekové odporúčania sú veľmi nápomocné pri výbere správnej hračky.</p>' },
            { id: 18, name: 'Ľubomír Kašuba', description: '<p>Odporúčania pedagógov mi dali istotu, že hračka je vhodná a bezpečná.</p>' },
            { id: 19, name: 'Kristína Babičová', description: '<p>Náhradné diely pre stavebnice — skvelé, že ich môžem dokúpiť.</p>' },
            { id: 20, name: 'Ján Bednár', description: '<p>Vianočné akcie sú každý rok lepšie. Skvelé zľavy na obľúbené značky.</p>' },
            { id: 21, name: 'Oľga Luptáková', description: '<p>Inšpirácia na darček mi veľmi pomohla — presne trafili vkus dcéry.</p>' },
            { id: 22, name: 'Daniel Hudák', description: '<p>Bezpečné platby a prehľadný košík. Nákup hotový za 5 minút.</p>' },
            { id: 23, name: 'Ingrid Pospíšilová', description: '<p>LeapFrog hračky sú skvelé pre malé deti. Vždy nájdem, čo hľadám.</p>' },
            { id: 24, name: 'Miroslav Belák', description: '<p>Overený obchod s výbornou povesťou. Nakupujem tu každé Vianoce.</p>' },
        ],
    },

    electronics: {
        label: 'Elektronika (electronics)',
        manufacturers: ['Samsung Slovakia', 'Apple', 'Sony', 'LG Electronics', 'Philips', 'Xiaomi', 'Lenovo', 'HP', 'Huawei', 'Asus', 'Acer', 'Dell', 'Toshiba', 'Panasonic', 'JBL', 'Bose', 'Anker', 'Logitech', 'Razer', 'SteelSeries', 'Corsair', 'Kingston', 'WD', 'Seagate'],
        productTypes: [
            { name: 'Mobilné zariadenia', groups: [{ name: 'Smartfóny' }, { name: 'Tablety' }] },
            { name: 'Domáca elektronika', groups: [{ name: 'Televízory' }, { name: 'Biela technika' }] },
            { name: 'Audio a video', groups: [{ name: 'Reproduktory' }, { name: 'Slúchadlá' }] },
        ],
        productTypeUnits: ['palce', 'mAh', 'GB', 'TB', 'Hz', 'W'],
        properties: [
            { name: 'Veľkosť displeja', type: 'decimal' },
            { name: 'Kapacita batérie', type: 'decimal' },
            { name: 'Operačná pamäť', type: 'decimal' },
            { name: 'Úložisko', type: 'decimal' },
            { name: 'Farba', type: 'select' },
            { name: 'WiFi', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 5, value: 'Čierna' },
            { property_id: 5, value: 'Biela' },
            { property_id: 5, value: 'Strieborná' },
            { property_id: 5, value: 'Zlatá' },
        ],
        categories: [
            { name: 'Smartfóny a mobilné telefóny', menu_name: 'Smartfóny', sub: [{ name: 'Android smartfóny' }, { name: 'iPhone' }, { name: 'Tlačidlové telefóny' }] },
            { name: 'Notebooky a laptopy', menu_name: 'Notebooky', sub: [{ name: 'Herné notebooky' }, { name: 'Pracovné notebooky' }, { name: 'Ultrabooky' }] },
            { name: 'Televízory', menu_name: 'Televízory', sub: [{ name: '4K televízory' }, { name: 'OLED televízory' }, { name: 'Smart TV' }] },
            { name: 'Audio a reproduktory', menu_name: 'Audio', sub: [{ name: 'Bezdrôtové slúchadlá' }, { name: 'Reproduktory' }, { name: 'Soundbary' }] },
            { name: 'Fotoaparáty a videokamery', menu_name: 'Fotoaparáty', sub: [{ name: 'Zrkadlovky' }, { name: 'Bezzrkadlovky' }, { name: 'Akčné kamery' }] },
            { name: 'Smart Home a domáca automatizácia', menu_name: 'Smart Home', sub: [{ name: 'Inteligentné žiarovky' }, { name: 'Bezpečnostné kamery' }, { name: 'Smart reproduktory' }] },
            { name: 'Tablety a e-čítačky', menu_name: 'Tablety', sub: [{ name: 'Tablety Android' }, { name: 'iPad' }, { name: 'E-čítačky' }] },
            { name: 'Periférne zariadenia a príslušenstvo', menu_name: 'Periférie', sub: [{ name: 'Klávesnice' }, { name: 'Myši' }, { name: 'Monitory' }, { name: 'Webkamery' }, { name: 'Slúchadlá do uší' }, { name: 'Tlačiarne a skenery' }, { name: 'Externé disky' }, { name: 'USB huby a docky' }, { name: 'Káble a adaptéry' }, { name: 'Repro a zvukové karty' }, { name: 'Podsvietené herné periférie' }] },
            { name: 'Herná elektronika a konzoly', menu_name: 'Gaming', sub: [{ name: 'Konzoly' }, { name: 'Herné príslušenstvo' }] },
            { name: 'Sieťové zariadenia a úložiská', menu_name: 'Sieť', sub: [{ name: 'Routery' }, { name: 'NAS zariadenia' }] },
            { name: 'Kompaktný bezdrôtový nabíjateľný elektronický produkt s digitálnym displejom a pokročilými funkciami', menu_name: 'Špeciality', sub: [] },
            { name: 'Výpredaj a bazár', menu_name: 'Výpredaj', sub: [] },
            { name: 'Počítače a komponenty', menu_name: 'PC komponenty', sub: [{ name: 'Procesory' }, { name: 'Grafické karty' }, { name: 'RAM pamäte' }, { name: 'Základné dosky' }] },
            { name: 'Chytrá domácnosť a IoT', menu_name: 'Smart Home 2', sub: [{ name: 'Inteligentné zásuvky' }, { name: 'Smart termostaty' }] },
            { name: 'Elektromobilita a príslušenstvo', menu_name: 'E-mobilita', sub: [{ name: 'Nabíjacie stanice' }, { name: 'E-kolobežky' }] },
            { name: 'Wearables a nositeľná elektronika', menu_name: 'Wearables', sub: [{ name: 'Smartwatch' }, { name: 'Fitness náramky' }, { name: 'VR headsety' }] },
            { name: '3D tlač a tvorba', menu_name: '3D tlač', sub: [{ name: '3D tlačiarne' }, { name: 'Filament a materiály' }] },
            { name: 'Drony a RC modely', menu_name: 'Drony', sub: [{ name: 'Fotografické drony' }, { name: 'RC helikoptéry' }] },
            { name: 'Napájanie a zálohovanie', menu_name: 'Napájanie', sub: [{ name: 'UPS zariadenia' }, { name: 'Powerbanky' }, { name: 'Solárne nabíjačky' }] },
            { name: 'Projektory a prezentačná technika', menu_name: 'Projektory', sub: [{ name: 'Domáce kinematografy' }, { name: 'Prezentačné projektory' }] },
            { name: 'Detské vzdelávacie tablety a zariadenia', menu_name: 'Detské technológie', sub: [] },
            { name: 'Repasovaná a B-kategória elektronika', menu_name: 'Repasované', sub: [] },
        ],
        productAdj: ['Bezdrôtový', 'Inteligentný', 'Kompaktný', 'Výkonný', 'Prémiový', 'Ultra', 'Pro', 'Smart', 'Kompaktný bezdrôtový nabíjateľný s digitálnym displejom'],
        productNoun: ['smartfón', 'notebook', 'televízor', 'slúchadlá', 'tablet', 'kamera', 'reproduktor', 'monitor', 'multifunkčný kuchynský robot so šľahačom a mlynčekom'],
        productExtra: ['5G', '4K OLED', 'WiFi 6', 'Bluetooth 5.0', '128GB', 's nabíjačkou', 'čierna verzia', 'séria Pro', 's príslušenstvom, zárukou 2 roky a expresným doručením zadarmo'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Testy a recenzie', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Návody', parent_id: 4 },
            { id: 8, name: 'Porovnania', parent_id: 4 },
            { id: 9, name: 'Trendy', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Servisné informácie', parent_id: 3 },
            { id: 12, name: 'Časté otázky', parent_id: 1 },
            { id: 13, name: 'Gaming', parent_id: 4 },
            { id: 14, name: 'Smart Home', parent_id: 4 },
            { id: 15, name: 'Mobilné zariadenia', parent_id: 5 },
            { id: 16, name: 'Audio a video', parent_id: 5 },
            { id: 17, name: 'Počítače a príslušenstvo', parent_id: 5 },
            { id: 18, name: 'Nákupné sprievodcovia', parent_id: 7 },
            { id: 19, name: 'Bezpečnosť online', parent_id: 4 },
            { id: 20, name: 'Ekológia a e-waste', parent_id: 4 },
            { id: 21, name: 'Wearables', parent_id: 5 },
            { id: 22, name: 'Drony a RC', parent_id: 4 },
            { id: 23, name: 'Fotografia', parent_id: 5 },
            { id: 24, name: 'Kariéra', parent_id: 1 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Najlepšie smartfóny 2024', section_id: 15 },
            { id: 5, name: 'Test notebookov', section_id: 17 },
            { id: 6, name: 'Novinky v elektronike', section_id: 6 },
            { id: 7, name: 'Ako vybrať správny televízor', section_id: 18 },
            { id: 8, name: 'Porovnanie bezdrôtových slúchadiel', section_id: 16 },
            { id: 9, name: 'Kompletný sprievodca výberom elektroniky', section_id: 7 },
            { id: 10, name: 'Smart Home — začíname s automatizáciou', section_id: 14 },
            { id: 11, name: 'Recenzia najnovších tabletov na trhu', section_id: 15 },
            { id: 12, name: 'Herné konzoly — čo prináša nová generácia', section_id: 13 },
            { id: 13, name: 'Najlepšie herné monitory 2024', section_id: 13 },
            { id: 14, name: 'WiFi 6 vs WiFi 5 — aký je rozdiel?', section_id: 8 },
            { id: 15, name: 'Ako správne recyklovať starú elektroniku', section_id: 20 },
            { id: 16, name: 'Fotoaparáty bezzrkadlovky — prehľad', section_id: 23 },
            { id: 17, name: 'Smartwatch — ktorý je najlepší?', section_id: 21 },
            { id: 18, name: 'Top 5 bezdrôtových reproduktorov', section_id: 16 },
            { id: 19, name: 'Drony pre začiatočníkov — ako začať', section_id: 22 },
            { id: 20, name: 'Online bezpečnosť — základy pre každého', section_id: 19 },
            { id: 21, name: 'Trendy v elektronike na rok 2025', section_id: 9 },
            { id: 22, name: 'Ako predĺžiť životnosť batérie smartfónu', section_id: 7 },
            { id: 23, name: 'Porovnanie iPhone vs Android', section_id: 8 },
            { id: 24, name: '4K vs 8K televízory — stojí to za to?', section_id: 8 },
            { id: 25, name: 'Nové procesory Apple M4 — test výkonu', section_id: 17 },
            { id: 26, name: 'Kedy nakúpiť elektroniku so zľavou', section_id: 9 },
        ],
        faqSections: [
            { name: 'Objednávky a platby' },
            { name: 'Záruka a servis' },
            { name: 'Technické otázky' },
            { name: 'Doručenie' },
            { name: 'Vrátenie tovaru' },
            { name: 'Kompatibilita' },
            { name: 'Softvér a aktualizácie' },
            { name: 'Náhradné diely' },
            { name: 'Repasované produkty' },
            { name: 'Financovanie a splátky' },
            { name: 'Bezpečnosť' },
            { name: 'Ekológia a recyklácia' },
            { name: 'Gaming' },
            { name: 'Smart Home' },
            { name: 'Fotografia' },
            { name: 'Mobilné zariadenia' },
            { name: 'Notebooky' },
            { name: 'Audio' },
            { name: 'Zákaznícky servis' },
            { name: 'Akcie a zľavy' },
            { name: 'Firemné objednávky' },
            { name: 'Predĺžená záruka' },
            { name: 'Poistenie produktov' },
            { name: 'Darčekové poukazy' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Je nákup na splátky možný?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Ako dlho trvá záručná oprava?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Kde môžem uplatniť záruku?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Aký operačný systém majú tablety v ponuke?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Čo znamená pojem refresh rate displeja?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako dlho trvá doručenie?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Je možné sledovať balík?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Do kedy môžem vrátiť tovar?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Čo ak je produkt poškodený pri doručení?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Je smartfón kompatibilný s mojím operátorom?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Funguje príslušenstvo so zariadeniami iných výrobcov?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Dostanú produkty automatické aktualizácie?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Predávate náhradné diely k produktom?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Aký je rozdiel medzi novým a repasovaným produktom?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Aké sú podmienky financovania?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Ako si chrániť zariadenie pred vírusmi?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Ako správne zrecyklovať starú elektroniku?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Ktorá konzola je najlepšia pre začiatočníkov?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Čo potrebujem na zriadenie Smart Home?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Aký fotoaparát odporúčate pre začiatočníkov?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Ako predĺžiť výdrž batérie smartfónu?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'Aký notebook je vhodný na prácu z domu?', description: FAQ_DESC },
            { faq_section_id: 18, name: 'Aké sú rozdiely medzi FLAC a MP3?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: '2 roky záruka', description: '<p>Na všetky produkty poskytujeme 2-ročnú záruku.</p>' },
            { id: 2, name: 'Autorizovaný servis', description: '<p>Opravy realizujú certifikovaní technici výrobcov.</p>' },
            { id: 3, name: 'Predĺžená záruka', description: '<p>Možnosť predĺženia záruky až na 5 rokov.</p>' },
            { id: 4, name: 'Bezpečné platby', description: '<p>Platby šifrované certifikátom SSL.</p>' },
            { id: 5, name: 'Doprava zadarmo', description: '<p>Doprava zadarmo pri objednávke nad 100 €.</p>' },
            { id: 6, name: 'Vrátenie do 30 dní', description: '<p>Vrátenie tovaru do 30 dní bez otázok.</p>' },
            { id: 7, name: 'Odborné poradenstvo', description: '<p>Naši špecialisti vám pomôžu s výberom.</p>' },
            { id: 8, name: 'Originálne produkty', description: '<p>Iba originálne zariadenia s platnou zárukou výrobcu.</p>' },
            { id: 9, name: 'Vernostný program', description: '<p>Zbierajte body a získajte zľavy.</p>' },
            { id: 10, name: 'Rýchle doručenie', description: '<p>Skladové produkty doručíme do 24 hodín.</p>' },
            { id: 11, name: 'Splátky bez úrokov', description: '<p>Nakúpte teraz a plaťte neskôr bez úrokov.</p>' },
            { id: 12, name: 'Zálohovanie dát', description: '<p>Pomôžeme vám zálohovať dáta pred opravou.</p>' },
            { id: 13, name: 'Poistenie zariadení', description: '<p>Možnosť poistenia elektroniky priamo pri kúpe.</p>' },
            { id: 14, name: 'Click & Collect', description: '<p>Objednajte online, vyzdvihnite v predajni.</p>' },
            { id: 15, name: 'Ekologická recyklácia', description: '<p>Bezplatne odovzdajte staré zariadenie pri kúpe nového.</p>' },
            { id: 16, name: 'Demo predajňa', description: '<p>Vyskúšajte produkty naživo v našej predajni.</p>' },
            { id: 17, name: 'Firemné ceny', description: '<p>Špeciálne ceny pre firmy a podnikateľov.</p>' },
            { id: 18, name: 'Newsletter zľava', description: '<p>Prihláste sa k odberu a získajte 5 % zľavu.</p>' },
            { id: 19, name: 'Darčekové poukazy', description: '<p>Darčekové poukazy v ľubovoľnej hodnote.</p>' },
            { id: 20, name: 'Zákaznícky servis 24/7', description: '<p>Online podpora dostupná nonstop.</p>' },
            { id: 21, name: 'Technická podpora', description: '<p>Telefonická technická podpora po celej záručnej dobe.</p>' },
            { id: 22, name: 'Inštalácia na mieste', description: '<p>Inštaláciu väčšej techniky vykonáme u vás doma.</p>' },
            { id: 23, name: 'Repasované produkty', description: '<p>Certifikované repasované produkty so zárukou.</p>' },
            { id: 24, name: 'Prioritný servis', description: '<p>Prioritné vybavenie opravy do 48 hodín.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Jakub Hollý', description: '<p>MacBook dorazil v perfektnom stave a rýchlejšie ako som čakal. Odporúčam!</p>' },
            { id: 2, name: 'Simona Urbánková', description: '<p>Odborné poradenstvo mi pomohlo vybrať správny televízor pre náš obývák.</p>' },
            { id: 3, name: 'Pavol Ďurica', description: '<p>Predĺžená záruka na 5 rokov — to je skutočná istota pri drahej elektronike.</p>' },
            { id: 4, name: 'Iveta Sedláková', description: '<p>Splátky bez úrokov sú skvelá možnosť. Notebook som si mohla dovoliť hneď.</p>' },
            { id: 5, name: 'Róbert Krajný', description: '<p>Razer produkty vždy skladom a za najlepšie ceny. Najlepší herný obchod!</p>' },
            { id: 6, name: 'Marta Súkeníková', description: '<p>Ekologická recyklácia starého laptopu — skvelá iniciatíva pri kúpe nového.</p>' },
            { id: 7, name: 'Andrej Kováčik', description: '<p>Technická podpora po telefóne mi pomohla okamžite. Výborný servis!</p>' },
            { id: 8, name: 'Ľubica Hrušková', description: '<p>Zálohovanie dát pred opravou — detail, ktorý ukazuje, že im záleží na zákazníkovi.</p>' },
            { id: 9, name: 'Marián Šimončič', description: '<p>Demo predajňa je výborná — mohol som si všetko vyskúšať pred kúpou.</p>' },
            { id: 10, name: 'Dagmar Petrová', description: '<p>Darčekové poukazy sú ideálny darček pre každého technonadšenca.</p>' },
            { id: 11, name: 'Štefan Kňaze', description: '<p>Firemné ceny sú naozaj výhodné — zariadili sme celú kanceláriu tu.</p>' },
            { id: 12, name: 'Gabriela Červená', description: '<p>Vrátenie do 30 dní bez problémov. Vymenili mi tablet za iný model.</p>' },
            { id: 13, name: 'Oto Fabrici', description: '<p>Repasované produkty so zárukou — ušetril som a dostal som skvelý produkt.</p>' },
            { id: 14, name: 'Natáša Kučerová', description: '<p>Zákaznícky servis 24/7 mi pomohol aj v noci počas pracovnej prezentácie.</p>' },
            { id: 15, name: 'Vladimír Rektor', description: '<p>Inštalácia televízora doma — profesionálna práca, odporúčam!</p>' },
            { id: 16, name: 'Zora Kubišová', description: '<p>Newsletter zľava 5 % — hneď som ju využila pri kúpe slúchadiel.</p>' },
            { id: 17, name: 'Dávid Mináč', description: '<p>Poistenie zariadenia priamo pri kúpe — skvelá možnosť za rozumnú cenu.</p>' },
            { id: 18, name: 'Marta Ďurišová', description: '<p>Originálne produkty vždy s platnou zárukou výrobcu. Žiadne pochybnosti.</p>' },
            { id: 19, name: 'Peter Hollý', description: '<p>Click & Collect funguje skvele — telefón som mal v ruke hodinu po objednávke.</p>' },
            { id: 20, name: 'Erika Vašíčková', description: '<p>Vernostný program — za rok nakupovania som ušetrila naozaj veľa.</p>' },
            { id: 21, name: 'Juraj Malíček', description: '<p>Prioritný servis do 48 hodín — môj laptop bol opravený veľmi rýchlo.</p>' },
            { id: 22, name: 'Soňa Lacová', description: '<p>Doprava zadarmo pri objednávke nad 100 € — výhodné pri drahej elektronike.</p>' },
            { id: 23, name: 'Tomáš Horváth', description: '<p>Skvelý výber Xiaomi produktov za super ceny. Vždy sa vrátim!</p>' },
            { id: 24, name: 'Renáta Nosálová', description: '<p>Autorizovaný servis priamo v obchode — všetko na jednom mieste.</p>' },
        ],
    },

    cars: {
        label: 'Auto-moto (cars)',
        manufacturers: ['Bosch Auto', 'Mann Filter', 'NGK', 'Valeo', 'Continental', 'Febi Bilstein', 'Sachs', 'Monroe', 'Gates', 'SKF', 'LUK', 'FAG', 'INA', 'Mahle', 'Hella', 'Osram', 'Philips Auto', 'Brembo', 'TRW', 'Ate', 'Textar', 'Mintex', 'EBC', 'Ferodo'],
        productTypes: [
            { name: 'Diely motora', groups: [{ name: 'Filtre' }, { name: 'Zapaľovanie' }] },
            { name: 'Karosárske diely', groups: [{ name: 'Svetlá' }, { name: 'Zrkadlá' }] },
            { name: 'Príslušenstvo', groups: [{ name: 'Interiér' }, { name: 'Exteriér' }] },
        ],
        productTypeUnits: ['ks', 'sada', 'l', 'mm', 'W'],
        properties: [
            { name: 'Kompatibilita', type: 'select' },
            { name: 'Hmotnosť', type: 'decimal' },
            { name: 'Materiál', type: 'select' },
            { name: 'Originál náhradný diel', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 1, value: 'Škoda' },
            { property_id: 1, value: 'Volkswagen' },
            { property_id: 1, value: 'BMW' },
            { property_id: 1, value: 'Audi' },
            { property_id: 3, value: 'Kov' },
            { property_id: 3, value: 'Plast' },
            { property_id: 3, value: 'Guma' },
        ],
        categories: [
            { name: 'Diely motora', menu_name: 'Diely motora', sub: [{ name: 'Olejové filtre' }, { name: 'Vzduchové filtre' }, { name: 'Zapaľovacie sviečky' }, { name: 'Chladiče a termostaty' }] },
            { name: 'Karosárske diely a lak', menu_name: 'Karosárske', sub: [{ name: 'Predné svetlá' }, { name: 'Zadné svetlá' }, { name: 'Nárazníky' }] },
            { name: 'Príslušenstvo a výbava auta', menu_name: 'Príslušenstvo', sub: [{ name: 'Autorádio' }, { name: 'Navigácie' }, { name: 'Držiaky telefónov' }, { name: 'Autosedačky' }, { name: 'Rohože a koberce' }, { name: 'Strešné nosiče' }, { name: 'Ťažné zariadenia' }, { name: 'Parkovacie senzory' }, { name: 'Dashcamy a kamery' }, { name: 'Autolekárničky a bezpečnosť' }, { name: 'Zimné príslušenstvo — škrabky a reťaze' }] },
            { name: 'Pneumatiky a kolesá', menu_name: 'Pneumatiky', sub: [{ name: 'Letné pneumatiky' }, { name: 'Zimné pneumatiky' }, { name: 'Disky' }] },
            { name: 'Starostlivosť a chémia pre autá', menu_name: 'Starostlivosť', sub: [{ name: 'Čistiace prostriedky' }, { name: 'Vosky a leštenky' }, { name: 'Oleje a mazivá' }] },
            { name: 'Brzdový systém a riadenie', menu_name: 'Brzdy', sub: [{ name: 'Brzdové doštičky' }, { name: 'Brzdové kotúče' }] },
            { name: 'Podvozok a riadenie', menu_name: 'Podvozok', sub: [{ name: 'Tlmiče' }, { name: 'Pružiny' }, { name: 'Guľové čapy' }] },
            { name: 'Elektrická výbava a diagnostika', menu_name: 'Elektrika', sub: [{ name: 'Akumulátory' }, { name: 'Alternátory' }] },
            { name: 'Prevodovka a spojka', menu_name: 'Prevodovka', sub: [{ name: 'Spojky' }, { name: 'Hnacie hriadele' }] },
            { name: 'Originálne a certifikované náhradné diely pre osobné automobily európskych značiek', menu_name: 'OEM diely', sub: [] },
            { name: 'Motocyklové diely a príslušenstvo', menu_name: 'Motocykle', sub: [{ name: 'Výfuky' }, { name: 'Riadidlá' }] },
            { name: 'Výpredaj a dopredaj skladu', menu_name: 'Výpredaj', sub: [] },
            { name: 'Tuning a výkonové úpravy', menu_name: 'Tuning', sub: [{ name: 'Vzduchové filtre výkon' }, { name: 'Výkonové výfuky' }, { name: 'Sústava zavesenia' }] },
            { name: 'Oleje, mazivá a chémia', menu_name: 'Oleje a chémia', sub: [{ name: 'Motorové oleje' }, { name: 'Prevodovkové oleje' }, { name: 'Kvapaliny' }] },
            { name: 'Zimná výbava a ochrana', menu_name: 'Zimná výbava', sub: [{ name: 'Zimné lopatky' }, { name: 'Reťaze' }, { name: 'Rozmrazovacie prostriedky' }] },
            { name: 'Strešné nosiče a preprava', menu_name: 'Nosiče', sub: [{ name: 'Strešné nosiče' }, { name: 'Nosiče bicyklov' }, { name: 'Ťažné zariadenia' }] },
            { name: 'Multimédium a navigácia', menu_name: 'Multimédium', sub: [{ name: 'Android Auto' }, { name: 'GPS navigácie' }, { name: 'Parkovacie kamery' }] },
            { name: 'Autosedačky a doplnky pre deti', menu_name: 'Autosedačky', sub: [{ name: 'Detské autosedačky' }, { name: 'Sieťky a organizéry' }] },
            { name: 'Veterány a špeciálne vozidlá', menu_name: 'Veterány', sub: [{ name: 'Oldtimer diely' }, { name: 'Renovačné produkty' }] },
            { name: 'Nákladné vozidlá a van príslušenstvo', menu_name: 'Nákladné', sub: [] },
            { name: 'Obaly a úložné riešenia do auta', menu_name: 'Úložné riešenia', sub: [] },
        ],
        productAdj: ['Originálny', 'Prémiový', 'Univerzálny', 'Výkonný', 'Kvalitný', 'OEM', 'Certifikovaný', 'Profesionálny', 'Originálny certifikovaný homologizovaný s dlhou životnosťou'],
        productNoun: ['filter', 'sviečka', 'tlmič', 'brzda', 'spojka', 'remeň', 'pumpa', 'snímač', 'komplexná súprava dielov s montážnym príslušenstvom'],
        productExtra: ['pre Škoda Fabia', 'pre VW Golf', 'pre BMW séria 3', 'originál OEM', 'sada 4ks', 'dlhá životnosť', 'certifikovaný', 's inštalačnými pokynmi a zárukou kvality'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Rady a tipy', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Údržba auta', parent_id: 4 },
            { id: 8, name: 'Tuning a úpravy', parent_id: 4 },
            { id: 9, name: 'Sezónne tipy', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Záruka a reklamácie', parent_id: 3 },
            { id: 12, name: 'Montážne návody', parent_id: 5 },
            { id: 13, name: 'Diagnostika', parent_id: 7 },
            { id: 14, name: 'Pneumatiky', parent_id: 5 },
            { id: 15, name: 'Elektrina a elektronika', parent_id: 7 },
            { id: 16, name: 'Motor a chladenie', parent_id: 7 },
            { id: 17, name: 'Karosáreň', parent_id: 5 },
            { id: 18, name: 'Bezpečnosť na cestách', parent_id: 4 },
            { id: 19, name: 'Oleje a mazivá', parent_id: 5 },
            { id: 20, name: 'Test produktov', parent_id: 4 },
            { id: 21, name: 'Veterány a oldtimery', parent_id: 8 },
            { id: 22, name: 'Výpredaj novinky', parent_id: 6 },
            { id: 23, name: 'Kariéra', parent_id: 1 },
            { id: 24, name: 'Časté otázky', parent_id: 1 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Ako vybrať správne pneumatiky', section_id: 14 },
            { id: 5, name: 'Zimná údržba auta', section_id: 9 },
            { id: 6, name: 'Výmena oleja — krok za krokom', section_id: 12 },
            { id: 7, name: 'Novinky v sortimente', section_id: 6 },
            { id: 8, name: 'OEM vs. aftermarket diely', section_id: 5 },
            { id: 9, name: 'Kompletný sprievodca starostlivosťou o auto', section_id: 7 },
            { id: 10, name: 'Ako správne čítať diagnostické kódy', section_id: 13 },
            { id: 11, name: 'Najčastejšie poruchy a ako im predísť', section_id: 7 },
            { id: 12, name: 'Zima sa blíži — pripravte auto správne', section_id: 9 },
            { id: 13, name: 'Výmena brzdových doštičiek — návod', section_id: 12 },
            { id: 14, name: 'Ako správne vybrať motorový olej', section_id: 19 },
            { id: 15, name: 'Chyby pri kúpe použitého auta', section_id: 5 },
            { id: 16, name: 'Top auto-moto akcie tohto mesiaca', section_id: 22 },
            { id: 17, name: 'Tuning — ako legálne upraviť auto', section_id: 8 },
            { id: 18, name: 'Bezpečné pneumatiky na zimu', section_id: 14 },
            { id: 19, name: 'Test brzdových doštičiek Brembo vs TRW', section_id: 20 },
            { id: 20, name: 'Ako fungovať bezpečne na mokrej ceste', section_id: 18 },
            { id: 21, name: 'Elektrické autá — čo treba vedieť o údržbe', section_id: 15 },
            { id: 22, name: 'Veteránske auto — kde hľadať diely', section_id: 21 },
            { id: 23, name: 'Filtrácia vzduchu a výkon motora', section_id: 16 },
            { id: 24, name: 'Lacné diely — na čo si dať pozor', section_id: 5 },
            { id: 25, name: 'Karosárske opravy DIY — základy', section_id: 17 },
            { id: 26, name: 'Ako čítať VIN číslo auta', section_id: 5 },
        ],
        faqSections: [
            { name: 'Kompatibilita dielov' },
            { name: 'Objednávky a doprava' },
            { name: 'Montáž a servis' },
            { name: 'Záruka a reklamácie' },
            { name: 'Platby' },
            { name: 'OEM vs aftermarket' },
            { name: 'Diagnostika' },
            { name: 'Pneumatiky' },
            { name: 'Oleje a mazivá' },
            { name: 'Elektrické a hybridné autá' },
            { name: 'Doručenie' },
            { name: 'Vrátenie tovaru' },
            { name: 'Tuning a úpravy' },
            { name: 'Bezpečnosť' },
            { name: 'Veterány' },
            { name: 'Firemné objednávky' },
            { name: 'Zákaznícky servis' },
            { name: 'Akcie a zľavy' },
            { name: 'Technické parametre' },
            { name: 'Klimatizácia' },
            { name: 'Predĺžená záruka' },
            { name: 'Dopravné poradenstvo' },
            { name: 'Inštalácia' },
            { name: 'Balenie a ochrana' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Ako zistím, či je diel kompatibilný s mojím autom?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Čo je to OEM diel?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Kedy dostanem svoju objednávku?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Doručujete na výdajné miesta?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Môžem si diel nechať namontovať vo vašom servise?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Máte partnerské servisy po celom Slovensku?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Aká je záručná doba na diely?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako reklamovať poškodený diel?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Sú aftermarket diely rovnako kvalitné ako OEM?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Kde si môžem nechať prečítať chybové kódy?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Kedy meniť letné pneumatiky na zimné?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Ako často meniť motorový olej?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Aké diely potrebuje elektrické auto?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Je možné sledovať zásielku?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Môžem vrátiť nepoužitý diel?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Čo je legálne pri tuningovaní auta?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Ako správne umyť auto bez poškodenia laku?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Kde nájdem diely na veterán?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Je možná firemná fakturácia?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'Kde vás môžem kontaktovať?', description: FAQ_DESC },
            { faq_section_id: 18, name: 'Kedy prebiehajú sezónne výpredaje?', description: FAQ_DESC },
            { faq_section_id: 19, name: 'Kde nájdem technické parametre produktu?', description: FAQ_DESC },
            { faq_section_id: 20, name: 'Ako doplniť chladivo klimatizácie?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Rýchla doprava', description: '<p>Skladové diely doručíme do 24 hodín.</p>' },
            { id: 2, name: 'OEM kvalita', description: '<p>Predávame iba originálne a certifikované diely.</p>' },
            { id: 3, name: 'Technická podpora', description: '<p>Pomôžeme vám s výberom správneho dielu.</p>' },
            { id: 4, name: 'Garancia kompatibility', description: '<p>Ak diel nepasuje, vymeníme ho zadarmo.</p>' },
            { id: 5, name: 'Záručný servis', description: '<p>Autorizovaný záručný servis priamo u nás.</p>' },
            { id: 6, name: 'Bezplatné vrátenie', description: '<p>Vrátenie nepoužitého dielu do 30 dní zadarmo.</p>' },
            { id: 7, name: 'Vyhľadávanie podľa VIN', description: '<p>Zadajte VIN číslo a nájdeme správny diel.</p>' },
            { id: 8, name: 'Kamenná predajňa', description: '<p>Navštívte nás osobne — poradíme na mieste.</p>' },
            { id: 9, name: 'Splátky bez úrokov', description: '<p>Nakúpte na splátky bez navýšenia.</p>' },
            { id: 10, name: 'Vernostný program', description: '<p>Za každý nákup získate body na ďalší.</p>' },
            { id: 11, name: 'Odborné poradenstvo', description: '<p>Tím skúsených autoopravárov vám poradí.</p>' },
            { id: 12, name: 'Expresné doručenie', description: '<p>Urgentné objednávky doručíme do 4 hodín.</p>' },
            { id: 13, name: 'Záruka 2 roky', description: '<p>Dvojročná záruka na všetky produkty.</p>' },
            { id: 14, name: 'Bezpečné platby', description: '<p>Chránené platby s 3D Secure overením.</p>' },
            { id: 15, name: 'Firemný účet', description: '<p>Osobitný účet s výhodami pre firmy.</p>' },
            { id: 16, name: 'Montážny servis', description: '<p>Zabezpečíme montáž dielu u partnerského servisu.</p>' },
            { id: 17, name: 'Diagnostika zadarmo', description: '<p>Bezplatná diagnostika pri objednávke dielu.</p>' },
            { id: 18, name: 'Pneumatikový servis', description: '<p>Montáž a vyvažovanie pneumatík v našom servise.</p>' },
            { id: 19, name: 'Skladové zásoby', description: '<p>Viac ako 50 000 položiek skladom.</p>' },
            { id: 20, name: 'Recyklácia starých dielov', description: '<p>Odovzdajte starý diel pri kúpe nového.</p>' },
            { id: 21, name: 'Asistenčná služba', description: '<p>Telefonická asistenčná linka pri poruche.</p>' },
            { id: 22, name: 'E-katalóg dielov', description: '<p>Rozsiahly online katalóg s technickými parametrami.</p>' },
            { id: 23, name: 'Tuningové poradenstvo', description: '<p>Legálny tuning — poradíme s úpravami.</p>' },
            { id: 24, name: 'Veteránske diely', description: '<p>Špeciálna sekcia pre diely na historické vozidlá.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Milan Gašparík', description: '<p>Originálne diely vždy skladom a doručené do druhého dňa. Ideálny partner pre môj servis.</p>' },
            { id: 2, name: 'Ľuboš Krajčí', description: '<p>Vyhľadávanie podľa VIN je geniálna funkcia — ihneď som našiel správny filter.</p>' },
            { id: 3, name: 'Kamil Bezák', description: '<p>Garancia kompatibility mi dala istotu pri objednávke brzdových platničiek.</p>' },
            { id: 4, name: 'Elena Kováčová', description: '<p>Záručný servis priamo u nich — rýchly a profesionálny. Odporúčam!</p>' },
            { id: 5, name: 'Norbert Takáč', description: '<p>Diagnostika zadarmo pri objednávke dielu — skvelá pridaná hodnota.</p>' },
            { id: 6, name: 'Ingrid Blaho', description: '<p>Technická podpora mi pomohla identifikovať správny diel. Výborná komunikácia.</p>' },
            { id: 7, name: 'Rastislav Bača', description: '<p>Expresné doručenie do 4 hodín zachránilo moju cestu. Ďakujem!</p>' },
            { id: 8, name: 'Monika Žitňanská', description: '<p>Vrátenie nepoužitého dielu do 30 dní — bezproblémové a profesionálne.</p>' },
            { id: 9, name: 'Dušan Prívara', description: '<p>Montážny servis u partnerského servisu — ušetril som čas aj starosti.</p>' },
            { id: 10, name: 'Viera Masárová', description: '<p>Firemný účet s výhodami — ideálne pre náš autoservis.</p>' },
            { id: 11, name: 'Marek Bugár', description: '<p>Splátky bez navýšenia pri drahších dieloch — výborná možnosť.</p>' },
            { id: 12, name: 'Dana Šafránková', description: '<p>Pneumatikový servis priamo v obchode — rýchly a lacný.</p>' },
            { id: 13, name: 'Jozef Ružička', description: '<p>OEM kvalita za rozumnú cenu. Viac ako 50 000 položiek skladom.</p>' },
            { id: 14, name: 'Marcela Pálová', description: '<p>Recyklácia starých dielov — zodpovedný prístup k životnému prostrediu.</p>' },
            { id: 15, name: 'Vladimír Gális', description: '<p>Kamenná predajňa s odborným personálom — vždy mi poradia na mieste.</p>' },
            { id: 16, name: 'Helena Bučková', description: '<p>Asistenčná linka pri poruche — rýchlo mi poradili, čo robiť.</p>' },
            { id: 17, name: 'Ján Horník', description: '<p>E-katalóg dielov je veľmi prehľadný. Nájdem všetko, čo potrebujem.</p>' },
            { id: 18, name: 'Beáta Gregušová', description: '<p>Rýchla doprava a výborné ceny. Môj muž je veľmi spokojný.</p>' },
            { id: 19, name: 'Rudolf Masaryk', description: '<p>Vernostný program — za každý nákup body na ďalší. Výborný nápad.</p>' },
            { id: 20, name: 'Zuzana Orlická', description: '<p>Tuningové poradenstvo — konečne legálne úpravy bez starostí.</p>' },
            { id: 21, name: 'Andrej Pálffy', description: '<p>Veteránske diely pre môj oldtimer — skvelé, že ich majú!</p>' },
            { id: 22, name: 'Ľudmila Kováčiková', description: '<p>Záruka 2 roky na všetky produkty — nakupujem s pokojom.</p>' },
            { id: 23, name: 'Peter Tóth', description: '<p>Bezpečné platby s 3D Secure — moje údaje sú v bezpečí.</p>' },
            { id: 24, name: 'Katarína Vlčková', description: '<p>Odborný tím automechanikov poradil pri výbere — šikovní ľudia!</p>' },
        ],
    },

    tools: {
        label: 'Náradie (tools)',
        manufacturers: ['Bosch', 'Makita', 'DeWalt', 'Stanley', 'Narex', 'Metabo', 'Hilti', 'Milwaukee', 'Ryobi', 'Black & Decker', 'Hitachi', 'Festool', 'Fein', 'Kärcher', 'Stihl', 'Husqvarna', 'Einhell', 'Parkside', 'Erbauer', 'Silverline', 'Draper', 'Clarke', 'Trend', 'Rothenberger'],
        productTypes: [
            { name: 'Elektrické nástroje', groups: [{ name: 'Vŕtačky' }, { name: 'Píly' }] },
            { name: 'Ručné nástroje', groups: [{ name: 'Kľúče' }, { name: 'Skrutkovače' }] },
            { name: 'Meracie nástroje', groups: [{ name: 'Laserové diaľkomery' }, { name: 'Vodováhy' }] },
        ],
        productTypeUnits: ['W', 'V', 'Nm', 'mm', 'kg', 'rpm'],
        properties: [
            { name: 'Výkon', type: 'decimal' },
            { name: 'Hmotnosť', type: 'decimal' },
            { name: 'Napájanie', type: 'select' },
            { name: 'Cordless (bez kábla)', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 3, value: '230V' },
            { property_id: 3, value: '18V akumulátor' },
            { property_id: 3, value: '12V akumulátor' },
            { property_id: 3, value: 'Batérie AA' },
        ],
        categories: [
            { name: 'Elektrické náradie', menu_name: 'Elektrické', sub: [{ name: 'Vŕtačky a šrubováky' }, { name: 'Brúsky' }, { name: 'Píly' }, { name: 'Frézky a hobľovačky' }] },
            { name: 'Ručné náradie', menu_name: 'Ručné', sub: [{ name: 'Kľúče' }, { name: 'Skrutkovače' }, { name: 'Kladivá' }] },
            { name: 'Meranie a vytyčovanie', menu_name: 'Meranie', sub: [{ name: 'Laserové meradlá' }, { name: 'Vodováhy' }, { name: 'Termokamery' }] },
            { name: 'Bezpečnosť a ochrana pri práci', menu_name: 'Bezpečnosť', sub: [{ name: 'Ochranné okuliare' }, { name: 'Rukavice' }, { name: 'Ochranné helmy' }] },
            { name: 'Dielňa a skladovanie', menu_name: 'Dielňa', sub: [{ name: 'Pracovné stoly' }, { name: 'Skrinky na náradie' }, { name: 'Vozíky' }] },
            { name: 'Záhradná technika a stroje', menu_name: 'Záhrada', sub: [{ name: 'Kosačky' }, { name: 'Reťazové píly' }] },
            { name: 'Akumulátorové náradie a príslušenstvo', menu_name: 'Akumulátorové', sub: [{ name: 'Akumulátory' }, { name: 'Nabíjačky' }, { name: 'Akumulátorové sady' }] },
            { name: 'Spájanie a zváranie', menu_name: 'Zváranie', sub: [{ name: 'Zvárací drôt' }, { name: 'Zváracie kukly' }] },
            { name: 'Pneumatické náradie a kompresory', menu_name: 'Pneumatické', sub: [{ name: 'Kompresory' }, { name: 'Pneumatické náradie' }] },
            { name: 'Profesionálne priemyselné náradie pre stavebníctvo a remeselníkov s dlhoročnou zárukou', menu_name: 'Priemyselné', sub: [] },
            { name: 'Príslušenstvo a spotrebný materiál', menu_name: 'Príslušenstvo', sub: [{ name: 'Vrtáky' }, { name: 'Kotúče' }, { name: 'Bity a nástavce' }, { name: 'Brúsny papier a plátno' }, { name: 'Pílové listy' }, { name: 'Frézovacie nože' }, { name: 'Upínacie prípravky' }, { name: 'Mazivá a oleje na náradie' }, { name: 'Elektrické káble a zástrčky' }, { name: 'Skrutky, matice a hmoždinky' }, { name: 'Tesnenia a lepidlá' }] },
            { name: 'Výpredaj a B-tovar', menu_name: 'Výpredaj', sub: [] },
            { name: 'Čistiaca technika a vysávače', menu_name: 'Čistiaca technika', sub: [{ name: 'Priemyselné vysávače' }, { name: 'Tlakové umývačky' }] },
            { name: 'Lešenie a rebriny', menu_name: 'Lešenia', sub: [{ name: 'Pojazdné lešenia' }, { name: 'Rebriny a rebríky' }] },
            { name: 'Zváranie a rezanie', menu_name: 'Zváranie', sub: [{ name: 'MIG/MAG zváračky' }, { name: 'TIG zváračky' }, { name: 'Plazmové rezačky' }] },
            { name: 'Vodoinštalácia a kúrenárstvo', menu_name: 'Vodoinštalácia', sub: [{ name: 'Rezné závitníky' }, { name: 'Lisovačky trubiek' }] },
            { name: 'Elektroinštalácia a elektro', menu_name: 'Elektroinštalácia', sub: [{ name: 'Svorkovnice' }, { name: 'Testeri napätia' }, { name: 'Pájecí príslušenstvo' }] },
            { name: 'Autodielňa a autopříslušenstvo', menu_name: 'Autodielňa', sub: [{ name: 'Zdvíhacie zariadenia' }, { name: 'Autodiagnostika' }] },
            { name: 'Tesniace a lepiace materiály', menu_name: 'Tesniace materiály', sub: [{ name: 'Silikóny' }, { name: 'Akrylové tmely' }, { name: 'Peny a penové izolátory' }] },
            { name: 'Obkladanie a dlažba', menu_name: 'Obkladanie', sub: [{ name: 'Rezačky obkladov' }, { name: 'Miešadlá malty' }] },
            { name: 'Bezpečnostné pomôcky pre výšku', menu_name: 'Výškové práce', sub: [{ name: 'Poistné laná' }, { name: 'Sedacie úväzky' }] },
            { name: 'Drevoobrábanie a tesárstvo', menu_name: 'Drevoobrábanie', sub: [{ name: 'Stolové píly' }, { name: 'Hobľovačky' }, { name: 'Frézky' }] },
        ],
        productAdj: ['Profesionálny', 'Aku', 'Výkonný', 'Kompaktný', 'Priemyselný', 'Ergonomický', 'Bezdrôtový', 'Ťažkotonážny', 'Profesionálny priemyselný ergonomický s ochranným puzdrom'],
        productNoun: ['vŕtačka', 'skrutkovač', 'brúska', 'píla', 'kľúč', 'kladivo', 'dláto', 'sekera', 'multifunkčný oscilačný nástroj s príslušenstvom a kufrík'],
        productExtra: ['18V', '1500W', 'so sadou bitov', 'v kufríku', 's nabíjačkou', 'XR séria', 'SDS+', 's LED osvetlením a dlhou výdržou batérie'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Návody', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Bezpečnosť pri práci', parent_id: 4 },
            { id: 8, name: 'Akumulátorové náradie', parent_id: 4 },
            { id: 9, name: 'Porovnania a testy', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Záručné podmienky', parent_id: 3 },
            { id: 12, name: 'DIY projekty', parent_id: 5 },
            { id: 13, name: 'Profesionálne poradenstvo', parent_id: 4 },
            { id: 14, name: 'Záhradná technika', parent_id: 5 },
            { id: 15, name: 'Zváranie', parent_id: 5 },
            { id: 16, name: 'Meranie a geodézia', parent_id: 5 },
            { id: 17, name: 'Stavba a rekonštrukcia', parent_id: 12 },
            { id: 18, name: 'Inštalácie a rozvody', parent_id: 12 },
            { id: 19, name: 'Správa náradia', parent_id: 7 },
            { id: 20, name: 'Sezónne tipy', parent_id: 4 },
            { id: 21, name: 'Elektrické náradie — základy', parent_id: 5 },
            { id: 22, name: 'Čistiaca technika', parent_id: 5 },
            { id: 23, name: 'Kariéra', parent_id: 1 },
            { id: 24, name: 'Časté otázky', parent_id: 1 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Ako vybrať vŕtačku', section_id: 5 },
            { id: 5, name: 'Základy práce s brúskou', section_id: 5 },
            { id: 6, name: 'Akumulátorové vs. káblové náradie', section_id: 8 },
            { id: 7, name: 'Novinky v sortimente', section_id: 6 },
            { id: 8, name: 'Bezpečnosť pri práci s náradia', section_id: 7 },
            { id: 9, name: 'Kompletný sprievodca výberom profesionálneho náradia', section_id: 5 },
            { id: 10, name: 'Ako správne skladovať a udržiavať náradie', section_id: 19 },
            { id: 11, name: 'Prehľad noviniek Milwaukee a DeWalt 2024', section_id: 6 },
            { id: 12, name: 'Laserové meradlá — test a porovnanie', section_id: 16 },
            { id: 13, name: 'Jarné čistenie záhrady — aké náradie potrebujete', section_id: 14 },
            { id: 14, name: 'Základy zvárania pre začiatočníkov', section_id: 15 },
            { id: 15, name: 'DIY — ako položiť dlažbu', section_id: 17 },
            { id: 16, name: 'Nové produkty Bosch 2024', section_id: 6 },
            { id: 17, name: 'Aké náradie potrebujete na rekonštrukciu kúpeľne', section_id: 17 },
            { id: 18, name: 'Cordless systémy — kompatibilita akumulátorov', section_id: 8 },
            { id: 19, name: 'Tlakové umývačky — ako správne použiť', section_id: 22 },
            { id: 20, name: 'IP krytia náradia — čo znamenajú čísla', section_id: 7 },
            { id: 21, name: 'Rebriny — výber a bezpečnosť', section_id: 7 },
            { id: 22, name: 'Test Festool vs Makita brúsky', section_id: 9 },
            { id: 23, name: 'Elektroinštalácia — náradie pre elektrikárov', section_id: 18 },
            { id: 24, name: 'Kärcher vs Nilfisk — porovnanie umývačiek', section_id: 9 },
            { id: 25, name: 'Ako správne ostríhať záhradný plot', section_id: 14 },
            { id: 26, name: 'Merací prístroj — multimeter pre každého', section_id: 16 },
        ],
        faqSections: [
            { name: 'Objednávky a dodanie' },
            { name: 'Záruka a servis' },
            { name: 'Technické poradenstvo' },
            { name: 'Akumulátory a napájanie' },
            { name: 'Bezpečnosť' },
            { name: 'Vrátenie tovaru' },
            { name: 'Príslušenstvo' },
            { name: 'Záhradná technika' },
            { name: 'Platby' },
            { name: 'Profesionálne vs hobby náradie' },
            { name: 'Prenájom náradia' },
            { name: 'Čistiaca technika' },
            { name: 'Zváranie' },
            { name: 'Meranie' },
            { name: 'Doprava nadrozmerných produktov' },
            { name: 'Montáž a inštalácia' },
            { name: 'Zákaznícky servis' },
            { name: 'Akcie a zľavy' },
            { name: 'Firemné objednávky' },
            { name: 'Predĺžená záruka' },
            { name: 'Drevoobrábanie' },
            { name: 'Elektroinštalačné náradie' },
            { name: 'Diagnostické prístroje' },
            { name: 'Ochranné pomôcky' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Koľko trvá dodanie náradí?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Je možné objednať expresné doručenie?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Kde si môžem nechať opraviť náradie?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Aká je záručná doba na elektrické náradie?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Aká je kompatibilita akumulátorov naprieč značkami?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Čo znamená IP stupeň krytia?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako dlho vydrží nabitý akumulátor?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Môžem použiť akumulátor inej značky?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Aké OOPP potrebujem pri brúsení?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Je nutné absolvovať školenie na zváranie?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Do kedy môžem vrátiť náradie?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Predávate originálne príslušenstvo?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Akú kosačku odporúčate pre menšiu záhradu?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Aký je rozdiel medzi hobby a profi náradia?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Ponúkate prenájom náradia?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Aký tlak je vhodný pre tlakové umývačky?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Čo potrebujem na MIG zváranie doma?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Aká presnosť má laserový diaľkomer?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Doručujete aj veľké stroje?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Ponúkate montáž zakúpeného náradia?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'Kde vás môžem kontaktovať?', description: FAQ_DESC },
            { faq_section_id: 18, name: 'Kedy sú sezónne výpredaje?', description: FAQ_DESC },
            { faq_section_id: 19, name: 'Je možná firemná fakturácia?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Servis a opravy', description: '<p>Zabezpečujeme autorizovaný servis všetkých predávaných značiek.</p>' },
            { id: 2, name: 'Profesionálne poradenstvo', description: '<p>Tím odborníkov vám pomôže vybrať správne náradie.</p>' },
            { id: 3, name: 'Rýchle doručenie', description: '<p>Skladové produkty doručíme do 24 hodín.</p>' },
            { id: 4, name: 'Záruka 3 roky', description: '<p>Na profesionálne náradie poskytujeme záruku až 3 roky.</p>' },
            { id: 5, name: 'Originálne príslušenstvo', description: '<p>Iba originálne príslušenstvo od výrobcov.</p>' },
            { id: 6, name: 'Demo náradie', description: '<p>Vyskúšajte náradie pred kúpou v našej predajni.</p>' },
            { id: 7, name: 'Prenájom náradia', description: '<p>Prenajmite si náradie pre jednorázové použitie.</p>' },
            { id: 8, name: 'Firemné objednávky', description: '<p>Špeciálne ceny a fakturácia pre firmy.</p>' },
            { id: 9, name: 'Rozsiahly sklad', description: '<p>Viac ako 20 000 položiek skladom ihneď k dispozícii.</p>' },
            { id: 10, name: 'Bezpečnostné vybavenie', description: '<p>Kompletné ochranné pomôcky k náradiu.</p>' },
            { id: 11, name: 'Vrátenie do 30 dní', description: '<p>Vrátenie nepoužitého náradía do 30 dní zadarmo.</p>' },
            { id: 12, name: 'Odborné školenia', description: '<p>Pravidelné školenia a workshopy pre zákazníkov.</p>' },
            { id: 13, name: 'Splátky bez úrokov', description: '<p>Nakúpte drahšie náradie na splátky bez poplatku.</p>' },
            { id: 14, name: 'Vernostný program', description: '<p>Zbierajte body a získajte odmeny za vernosť.</p>' },
            { id: 15, name: 'Expresné doručenie', description: '<p>Urgentné doručenie do 4 hodín v meste.</p>' },
            { id: 16, name: 'Zákaznícka podpora', description: '<p>Odborná pomoc pri výbere a použití náradia.</p>' },
            { id: 17, name: 'Garancia ceny', description: '<p>Nájdete lacnejšie? Vyrovnáme cenu.</p>' },
            { id: 18, name: 'Akumulátorový systém', description: '<p>Rozsiahly výber akumulátorových systémov.</p>' },
            { id: 19, name: 'Kamenná predajňa', description: '<p>Navštívte nás a vyskúšajte náradie naživo.</p>' },
            { id: 20, name: 'B2B platforma', description: '<p>Pohodlné objednávanie pre firemných zákazníkov.</p>' },
            { id: 21, name: 'Recyklácia starého náradia', description: '<p>Ekologická likvidácia opotrebovaného náradia.</p>' },
            { id: 22, name: 'Náhradné diely', description: '<p>Dostupné náhradné diely pre väčšinu modelov.</p>' },
            { id: 23, name: 'Inštalácia na mieste', description: '<p>Inštalácia strojov priamo u zákazníka.</p>' },
            { id: 24, name: 'Technická dokumentácia', description: '<p>Kompletná dokumentácia a návody na stiahnutie.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Ľubomír Pažický', description: '<p>Makita vždy skladom a za výborné ceny. Môj obľúbený dodávateľ náradia.</p>' },
            { id: 2, name: 'Stanislava Kováčová', description: '<p>Profesionálne poradenstvo — pomohli mi vybrať správnu vŕtačku pre domácnosť.</p>' },
            { id: 3, name: 'Ján Slobodník', description: '<p>Prenájom náradia pre jednorázové použitie — výborný nápad, ušetril som.</p>' },
            { id: 4, name: 'Miriam Kašiarová', description: '<p>Odborné školenie k náradiu — naučila som sa bezpečne používať uhlovú brúsku.</p>' },
            { id: 5, name: 'Peter Čierny', description: '<p>Záruka 3 roky na profesionálne náradie. Investícia, ktorá sa oplatí.</p>' },
            { id: 6, name: 'Eva Kopčanová', description: '<p>Demo náradie v predajni — skúsila som priamu uhlová brúsku pred kúpou.</p>' },
            { id: 7, name: 'Branislav Filo', description: '<p>Splátky bez úrokov pri drahej Festool píle — výborná možnosť.</p>' },
            { id: 8, name: 'Agáta Mináčová', description: '<p>Garancia ceny — nájdete lacnejšie a vyrovnajú cenu. Super!</p>' },
            { id: 9, name: 'Marián Varga', description: '<p>Firemné objednávky s faktúrou — zariadili sme celú dielňu tu.</p>' },
            { id: 10, name: 'Lucia Štefanová', description: '<p>Bezpečnostné pomôcky k náradiu — skvelé, že ich predávajú spolu.</p>' },
            { id: 11, name: 'Milan Krupička', description: '<p>Expresné doručenie do 4 hodín — stavba mohla pokračovať bez prestávky.</p>' },
            { id: 12, name: 'Dagmar Hrubá', description: '<p>Servis a opravy priamo tu — môj Bosch je opäť ako nový.</p>' },
            { id: 13, name: 'Juraj Mráz', description: '<p>Náhradné diely dostupné — nemusel som kupovať celú novú pílu.</p>' },
            { id: 14, name: 'Alena Procházková', description: '<p>Zákaznícka podpora mi poradila s bezpečným použitím náradia.</p>' },
            { id: 15, name: 'Tomáš Kováč', description: '<p>Recyklácia starého náradia — ekologická zodpovednosť, ktorú oceňujem.</p>' },
            { id: 16, name: 'Ingrid Zacharová', description: '<p>Inštalácia stroja priamo u nás doma. Profesionálna práca, žiadne starosti.</p>' },
            { id: 17, name: 'Róbert Náhlik', description: '<p>Akumulátorový systém Makita — všetky nástroje na jednu batériu. Výborné!</p>' },
            { id: 18, name: 'Veronika Šimánková', description: '<p>Rýchle doručenie a perfektné balenie. Vŕtačka prišla nepoškodená.</p>' },
            { id: 19, name: 'Dušan Nemec', description: '<p>B2B platforma je výborná pre firemné objednávky. Šetri čas.</p>' },
            { id: 20, name: 'Jana Veselá', description: '<p>Vrátenie nepoužitého náradia do 30 dní — bezproblémové.</p>' },
            { id: 21, name: 'Michal Krčmár', description: '<p>Rozsiahly sklad — vždy nájdem, čo potrebujem na stavbu.</p>' },
            { id: 22, name: 'Zdenka Horníková', description: '<p>Originálne príslušenstvo od výrobcov — spoľahlivosť a dlhá životnosť.</p>' },
            { id: 23, name: 'Vladimír Sedlák', description: '<p>Kamenná predajňa s odborným personálom — vždy ochotne poradia.</p>' },
            { id: 24, name: 'Katarína Benešová', description: '<p>Technická dokumentácia dostupná online — môj manžel ju využíva každý deň.</p>' },
        ],
    },

    books: {
        label: 'Knihy (books)',
        manufacturers: ['Ikar', 'Slovart', 'Albatros Media', 'Motýľ', 'Tatran', 'Fragment', 'Fortuna Libri', 'Publixing', 'Práh', 'Dixit', 'Timeless Books', 'Artforum', 'Perfekt', 'Grada', 'Computer Press', 'Zoner Press', 'Penguin', 'Random House', 'Harper Collins', 'Scholastic', 'Bloomsbury', 'Hachette', 'Oxford University Press', 'Cambridge University Press'],
        productTypes: [
            { name: 'Beletria', groups: [{ name: 'Romány' }, { name: 'Detektívky' }] },
            { name: 'Literatúra faktu', groups: [{ name: 'Biografie' }, { name: 'História' }] },
            { name: 'Detské knihy', groups: [{ name: 'Rozprávky' }, { name: 'Encyklopédie' }] },
        ],
        productTypeUnits: ['str.', 'ks', 'sada'],
        properties: [
            { name: 'Autor', type: 'text' },
            { name: 'Počet strán', type: 'decimal' },
            { name: 'Formát', type: 'select' },
            { name: 'Jazyk', type: 'select' },
            { name: 'Séria', type: 'text' },
        ],
        productTypeOptions: [
            { property_id: 3, value: 'A5' },
            { property_id: 3, value: 'A4' },
            { property_id: 3, value: 'Kapesné vydanie' },
            { property_id: 4, value: 'Slovenčina' },
            { property_id: 4, value: 'Čeština' },
            { property_id: 4, value: 'Angličtina' },
        ],
        categories: [
            { name: 'Beletria', menu_name: 'Beletria', sub: [{ name: 'Romány' }, { name: 'Detektívky' }, { name: 'Sci-fi a fantasy' }, { name: 'Historická beletria' }, { name: 'Horory a thrillery' }, { name: 'Romantické romány' }, { name: 'Dobrodružná literatúra' }, { name: 'Satira a humor' }, { name: 'Poviedky a novely' }, { name: 'Svetová klasika' }, { name: 'Slovenská a česká literatúra' }] },
            { name: 'Literatúra faktu', menu_name: 'Literatúra faktu', sub: [{ name: 'Biografie' }, { name: 'História' }, { name: 'Psychológia' }] },
            { name: 'Detské knihy a literatúra pre mládež', menu_name: 'Detské', sub: [{ name: 'Pre najmenších (0–3)' }, { name: 'Rozprávky' }, { name: 'Dobrodružná literatúra' }] },
            { name: 'Komiksy a grafické romány', menu_name: 'Komiksy', sub: [{ name: 'Manga' }, { name: 'Americké komiksy' }, { name: 'Európske komiksy' }] },
            { name: 'Vzdelávacie a odborné knihy', menu_name: 'Vzdelávacie', sub: [{ name: 'Jazykové kurzy' }, { name: 'Odborná literatúra' }] },
            { name: 'Kuchárske knihy a gastronómia', menu_name: 'Kuchárky', sub: [{ name: 'Slovenská kuchyňa' }, { name: 'Svetová kuchyňa' }, { name: 'Vegánska a zdravá kuchyňa' }] },
            { name: 'Cestovanie a sprievodcovia', menu_name: 'Cestovanie', sub: [{ name: 'Európa' }, { name: 'Svet' }] },
            { name: 'Biznis, ekonomika a osobný rozvoj', menu_name: 'Biznis', sub: [{ name: 'Manažment' }, { name: 'Osobný rozvoj' }, { name: 'Financie' }] },
            { name: 'Príroda, veda a technika', menu_name: 'Veda', sub: [{ name: 'Astronómia' }, { name: 'Biológia' }] },
            { name: 'Umenie, hudba a film', menu_name: 'Umenie', sub: [{ name: 'Dejiny umenia' }, { name: 'Fotografia' }] },
            { name: 'Kompletné vydania, kolekcie a zberateľské edície pre náruživých čitateľov', menu_name: 'Kolekcie', sub: [] },
            { name: 'Výpredaj a zľavnené tituly', menu_name: 'Výpredaj', sub: [] },
            { name: 'Komiksy a manga', menu_name: 'Komiksy', sub: [{ name: 'Marvel a DC' }, { name: 'Manga' }, { name: 'Európske komiksy' }] },
            { name: 'Audioknihy a e-knihy', menu_name: 'Digitálne', sub: [{ name: 'Audioknihy' }, { name: 'E-knihy PDF' }] },
            { name: 'Slovenská literatúra', menu_name: 'Slovenská', sub: [{ name: 'Klasická literatúra' }, { name: 'Súčasní autori' }] },
            { name: 'Encyklopédie a slovníky', menu_name: 'Encyklopédie', sub: [{ name: 'Jazykové slovníky' }, { name: 'Tematické encyklopédie' }] },
            { name: 'Duchovná literatúra a filozofia', menu_name: 'Duchovná', sub: [{ name: 'Náboženstvo' }, { name: 'Filozofia' }, { name: 'Meditácia' }] },
            { name: 'Hobby a záľuby', menu_name: 'Hobby', sub: [{ name: 'Záhrada' }, { name: 'Šach a hry' }, { name: 'Hudba a film' }] },
            { name: 'Akademické a vysokoškolské učebnice', menu_name: 'Akademické', sub: [{ name: 'Právo a ekonómia' }, { name: 'Technické odbory' }] },
            { name: 'Časopisy a periodická tlač', menu_name: 'Časopisy', sub: [{ name: 'Týždenníky' }, { name: 'Mesačníky' }] },
            { name: 'Mapy a atlasy', menu_name: 'Mapy', sub: [{ name: 'Turistické mapy' }, { name: 'Autoatlasy' }] },
            { name: 'Noty a hudobná literatúra', menu_name: 'Noty', sub: [] },
        ],
        productAdj: ['Záhadný', 'Tajomný', 'Nový', 'Bestseller', 'Ocenený', 'Ilustrovaný', 'Rozšírený', 'Limitovaný', 'Komplexný ilustrovaný encyklopedický'],
        productNoun: ['román', 'príbeh', 'detektívka', 'cestopis', 'autobiografia', 'encyklopédia', 'atlas', 'sprievodca', 'komplexný sprievodca pre začiatočníkov aj pokročilých'],
        productExtra: ['2. vydanie', 'ilustrované vydanie', 's predhovorom', 'vrecková edícia', 'limitovaná séria', 'pre začiatočníkov', 'kompletné vydanie', 'doplnené a opravené vydanie s novou kapitolou'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Recenzie kníh', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Autorské stretnutia', parent_id: 4 },
            { id: 8, name: 'Tipy na čítanie', parent_id: 4 },
            { id: 9, name: 'Žánrové odporúčania', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Doprava a balenie', parent_id: 3 },
            { id: 12, name: 'Knižné akcie', parent_id: 4 },
            { id: 13, name: 'Slovenská literatúra', parent_id: 5 },
            { id: 14, name: 'Zahraničná literatúra', parent_id: 5 },
            { id: 15, name: 'Detektívky a thrillery', parent_id: 9 },
            { id: 16, name: 'Sci-fi a fantasy', parent_id: 9 },
            { id: 17, name: 'Odborná literatúra', parent_id: 9 },
            { id: 18, name: 'Romantika a love story', parent_id: 9 },
            { id: 19, name: 'Komiksy a manga', parent_id: 4 },
            { id: 20, name: 'Elektronické a audioknihy', parent_id: 4 },
            { id: 21, name: 'Darčeky z kníh', parent_id: 8 },
            { id: 22, name: 'Knižné kluby', parent_id: 4 },
            { id: 23, name: 'Kariéra', parent_id: 1 },
            { id: 24, name: 'Časté otázky', parent_id: 1 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Tipy na čítanie', section_id: 8 },
            { id: 5, name: 'Knižné novinky', section_id: 6 },
            { id: 6, name: 'Rozhovor s autorom mesiaca', section_id: 7 },
            { id: 7, name: 'Top 10 kníh pre leto', section_id: 5 },
            { id: 8, name: 'Bestsellery zahraničných vydavateľstiev', section_id: 14 },
            { id: 9, name: 'Kompletný sprievodca výberom kníh ako darčeka', section_id: 21 },
            { id: 10, name: 'Nové tituly slovenských autorov', section_id: 13 },
            { id: 11, name: 'Recenzia: najlepšie sci-fi série 2024', section_id: 16 },
            { id: 12, name: 'Čítanie pred spaním — tipy pre dospelých aj deti', section_id: 8 },
            { id: 13, name: 'Detektívky — 10 titulov, ktoré musíte čítať', section_id: 15 },
            { id: 14, name: 'Fantasy séria pre začiatočníkov', section_id: 16 },
            { id: 15, name: 'Ako čítať viac — praktické tipy', section_id: 8 },
            { id: 16, name: 'Nové komiksy v ponuke', section_id: 19 },
            { id: 17, name: 'Audioknihy — výhody a odporúčania', section_id: 20 },
            { id: 18, name: 'Knižný klub — ako funguje?', section_id: 22 },
            { id: 19, name: 'Darčekové tipy — knihy pre každého', section_id: 21 },
            { id: 20, name: 'Romantická literatúra — top tituly', section_id: 18 },
            { id: 21, name: 'Odborné knihy — novinky v IT a programovaní', section_id: 17 },
            { id: 22, name: 'Jarné knižné akcie', section_id: 12 },
            { id: 23, name: 'Rozhovor s prekladateľom bestselleru', section_id: 7 },
            { id: 24, name: 'Recenzia: Najlepšia slovenská próza roka', section_id: 13 },
            { id: 25, name: 'Manga pre začiatočníkov — kde začať', section_id: 19 },
            { id: 26, name: 'Zberateľské vydania — prehľad noviniek', section_id: 5 },
        ],
        faqSections: [
            { name: 'Objednávky a dodanie' },
            { name: 'Darčekové balenie' },
            { name: 'Vrátenie a reklamácie' },
            { name: 'Digitálne produkty' },
            { name: 'Zľavy a akcie' },
            { name: 'Knižné kluby' },
            { name: 'Dostupnosť titulov' },
            { name: 'Platby' },
            { name: 'Zahraničné vydania' },
            { name: 'Zákaznícky servis' },
            { name: 'Darčekové poukazy' },
            { name: 'Autogramiády a podujatia' },
            { name: 'Vydavateľstvá' },
            { name: 'Predplatné' },
            { name: 'Komiksy a manga' },
            { name: 'Audioknihy' },
            { name: 'E-knihy' },
            { name: 'Školské a učebnicové tituly' },
            { name: 'Firemné objednávky' },
            { name: 'Vernostný program' },
            { name: 'Poškodené knihy' },
            { name: 'Slovenské vydania' },
            { name: 'Recenzia a odporúčania' },
            { name: 'Novinky a objednanie dopredu' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Ako dlho trvá doručenie knihy?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Je možné sledovať zásielku?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Môžem si vyžiadať darčekové balenie?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Je darčekové balenie platené?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Čo ak dostanem poškodenú knihu?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Môžem vrátiť prečítanú knihu?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako fungujú e-knihy?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Na akom zariadení prehrám audioknihu?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Kedy sú výpredaje kníh?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Ako sa stať členom knižného klubu?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Čo ak hľadaný titul nie je skladom?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Doručujete anglické knihy?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Ako vás môžem kontaktovať?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Kde zakúpiť darčekový poukaz?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Organizujete podpisové akcie?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Spolupracujete priamo s vydavateľstvami?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Je možné predplatiť sériu kníh?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Predávate originálne japonské mange?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Ako stiahnuť zakúpenú audioknihu?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'V akom formáte sú e-knihy?', description: FAQ_DESC },
            { faq_section_id: 18, name: 'Predávate učebnice pre základné školy?', description: FAQ_DESC },
            { faq_section_id: 19, name: 'Je možná firemná fakturácia?', description: FAQ_DESC },
            { faq_section_id: 20, name: 'Ako získam vernostné body?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Darčekové balenie', description: '<p>Každú knihu radi zabalíme ako darček zadarmo.</p>' },
            { id: 2, name: 'Rýchle doručenie', description: '<p>Doručenie do 48 hodín pri objednávke do 14:00.</p>' },
            { id: 3, name: 'Knižný klub', description: '<p>Pravidelné odporúčania a zľavy pre členov knižného klubu.</p>' },
            { id: 4, name: 'Vrátenie do 30 dní', description: '<p>Spokojnosť zaručená alebo peniaze naspäť.</p>' },
            { id: 5, name: 'Viac ako 100 000 titulov', description: '<p>Najväčší výber kníh na Slovensku.</p>' },
            { id: 6, name: 'Slovenská literatura', description: '<p>Špeciálna sekcia pre slovenských autorov.</p>' },
            { id: 7, name: 'Audioknihy', description: '<p>Rozsiahla ponuka audiokníh pre každú príležitosť.</p>' },
            { id: 8, name: 'E-knihy', description: '<p>Okamžité stiahnutie po zaplatení.</p>' },
            { id: 9, name: 'Zákaznícke recenzie', description: '<p>Tisíce overených recenzií od čitateľov.</p>' },
            { id: 10, name: 'Zľavy pre školy', description: '<p>Špeciálne ceny pre školy a vzdelávacie inštitúcie.</p>' },
            { id: 11, name: 'Novinky každý týždeň', description: '<p>Každý týždeň nové tituly priamo od vydavateľov.</p>' },
            { id: 12, name: 'Darčekové poukazy', description: '<p>Darčekové poukazy v hodnote 10–200 €.</p>' },
            { id: 13, name: 'Odborné odporúčania', description: '<p>Naši redaktori odporúčajú tie najlepšie tituly.</p>' },
            { id: 14, name: 'Bezpečné platby', description: '<p>Šifrované platby s SSL ochranou.</p>' },
            { id: 15, name: 'Doprava zadarmo', description: '<p>Doprava zadarmo pri objednávke nad 30 €.</p>' },
            { id: 16, name: 'Vernostný program', description: '<p>Za každé euro zbierajte body na ďalší nákup.</p>' },
            { id: 17, name: 'Knižné predplatné', description: '<p>Predplaťte si mesačné doručenie noviniek.</p>' },
            { id: 18, name: 'Detská sekcia', description: '<p>Špeciálna ponuka kníh pre deti a mládež.</p>' },
            { id: 19, name: 'Komiksy a manga', description: '<p>Najväčší výber komiksov a mangy na Slovensku.</p>' },
            { id: 20, name: 'Firemné objednávky', description: '<p>Hromadné objednávky pre firmy za výhodné ceny.</p>' },
            { id: 21, name: 'Autorské podujatia', description: '<p>Pravidelné autogramiády a stretnutia s autormi.</p>' },
            { id: 22, name: 'Zákaznícka podpora', description: '<p>Poradíme vám s výberom každý deň.</p>' },
            { id: 23, name: 'Recenzentský klub', description: '<p>Buďte prví, kto prečíta novinky a napíše recenziu.</p>' },
            { id: 24, name: 'Limitované vydania', description: '<p>Zberateľské a limitované edície kníh.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Eva Krupová', description: '<p>Obrovský výber kníh a rýchle doručenie. Môj obľúbený kníhkupec online!</p>' },
            { id: 2, name: 'Martin Čáni', description: '<p>Knižný klub mi každý mesiac odporučí niečo výborné. Skvelá služba!</p>' },
            { id: 3, name: 'Soňa Béresová', description: '<p>Darčekové balenie kníh je nádherné — ideálny darček pre každý vek.</p>' },
            { id: 4, name: 'Lukáš Greguš', description: '<p>Audioknihy dostupné okamžite po zaplatení. Počúvam každý deň cestou do práce.</p>' },
            { id: 5, name: 'Daniela Húsková', description: '<p>Slovenská literatúra — nakoniec ju nájdem celú na jednom mieste.</p>' },
            { id: 6, name: 'Pavel Kováček', description: '<p>E-knihy ihneď k dispozícii — nemusím čakať na doručenie.</p>' },
            { id: 7, name: 'Ľudmila Mináčová', description: '<p>Recenzentský klub — som prvá, kto číta novinky. Absolútna radosť!</p>' },
            { id: 8, name: 'Radovan Šimko', description: '<p>Odborné odporúčania redaktorov mi pomohli objaviť skvelých autorov.</p>' },
            { id: 9, name: 'Katarína Horáčková', description: '<p>Zľavy pre školy sú výborné. Knižnicu sme zásobili za polovicu ceny.</p>' },
            { id: 10, name: 'Ján Fiala', description: '<p>Knižné predplatné — každý mesiac nové tituly priamo do schránky.</p>' },
            { id: 11, name: 'Anna Belková', description: '<p>Komiksy a manga — najväčší výber, aký som kde videla.</p>' },
            { id: 12, name: 'Ľubor Janček', description: '<p>Firemné objednávky za výhodné ceny — zásobili sme celú firemnú knižnicu.</p>' },
            { id: 13, name: 'Veronika Bučková', description: '<p>Autorské podujatia — stretla som svojho obľúbeného autora. Úžasný zážitok!</p>' },
            { id: 14, name: 'Miroslav Kováč', description: '<p>Novinky každý týždeň — vždy nájdem, čo práve vyšlo.</p>' },
            { id: 15, name: 'Petra Holíková', description: '<p>Detská sekcia je výborná — dcérka si vždy nájde niečo nové.</p>' },
            { id: 16, name: 'Tomáš Bača', description: '<p>Doprava zadarmo pri objednávke nad 30 € — veľmi rozumná hranica.</p>' },
            { id: 17, name: 'Marcela Výrostková', description: '<p>Darčekové poukazy sú ideálny vianočný darček pre každého čitateľa.</p>' },
            { id: 18, name: 'Ondrej Kliment', description: '<p>Zákaznícke recenzie mi vždy pomôžu rozhodnúť sa. Verím im viac ako reklamám.</p>' },
            { id: 19, name: 'Ľubica Novotná', description: '<p>Limitované vydania kníh — moja zbierka rastie každý rok.</p>' },
            { id: 20, name: 'Ivan Šimkovič', description: '<p>Vrátenie do 30 dní — spokojnosť zaručená. Skúsil som, funguje to!</p>' },
            { id: 21, name: 'Marta Čechová', description: '<p>Vernostný program — za každé euro body. Mám už dosť na zadarmo knihu.</p>' },
            { id: 22, name: 'Jaroslav Krajčí', description: '<p>Bezpečné platby s SSL ochranou — nakupujem bez obáv.</p>' },
            { id: 23, name: 'Silvia Janáčová', description: '<p>Zákaznícka podpora mi vždy poradí s výberom knihy podľa veku dieťaťa.</p>' },
            { id: 24, name: 'Michal Blaho', description: '<p>Najväčší výber kníh na Slovensku — vždy nájdem, čo hľadám.</p>' },
        ],
    },

    clothing: {
        label: 'Oblečenie (clothing)',
        manufacturers: ['Dedoles', 'Heavy Pro', 'DMD', 'Wexta', 'Bleed', 'Zoot', 'Husky', 'Nordblanc', 'Alpine Pro', 'Regatta', 'Columbia', 'The North Face', 'Patagonia', 'Mammut', 'Salewa', 'Vaude', 'Jack Wolfskin', 'Bergans', 'Haglöfs', "Arc'teryx", 'Marmot', 'Rab', 'Outdoor Research', 'Fjällräven'],
        productTypes: [
            { name: 'Vrchné odevy', groups: [{ name: 'Tričká a košele' }, { name: 'Bundy a kabáty' }] },
            { name: 'Spodné prádlo', groups: [{ name: 'Dámske prádlo' }, { name: 'Pánske prádlo' }] },
            { name: 'Obuv', groups: [{ name: 'Športová obuv' }, { name: 'Vychádzková obuv' }] },
        ],
        productTypeUnits: ['ks', 'pár', 'sada'],
        properties: [
            { name: 'Veľkosť', type: 'select' },
            { name: 'Materiál', type: 'select' },
            { name: 'Pohlavie', type: 'select' },
            { name: 'Vodoodolnosť', type: 'boolean' },
        ],
        productTypeOptions: [
            { property_id: 1, value: 'XS' },
            { property_id: 1, value: 'S' },
            { property_id: 1, value: 'M' },
            { property_id: 1, value: 'L' },
            { property_id: 1, value: 'XL' },
            { property_id: 1, value: 'XXL' },
            { property_id: 2, value: 'Bavlna' },
            { property_id: 2, value: 'Polyester' },
            { property_id: 2, value: 'Vlna' },
            { property_id: 2, value: 'Koža' },
            { property_id: 3, value: 'Dámske' },
            { property_id: 3, value: 'Pánske' },
            { property_id: 3, value: 'Unisex' },
        ],
        categories: [
            { name: 'Dámska móda', menu_name: 'Dámska móda', sub: [{ name: 'Tričká a topy' }, { name: 'Nohavice a džínsy' }, { name: 'Blúzky a košele' }, { name: 'Dámske sety' }, { name: 'Šortky a sukne' }, { name: 'Legíny a tepláky' }, { name: 'Overally a kombinézy' }, { name: 'Plavky a plážová móda' }, { name: 'Tehotenská móda' }, { name: 'Večerné a spoločenské oblečenie' }, { name: 'Dámske bundy a vesty' }] },
            { name: 'Pánska móda', menu_name: 'Pánska móda', sub: [{ name: 'Tričká a polo' }, { name: 'Nohavice a džínsy' }, { name: 'Košele' }, { name: 'Pánske sety' }] },
            { name: 'Detské oblečenie', menu_name: 'Detské', sub: [{ name: 'Pre dievčatá' }, { name: 'Pre chlapcov' }, { name: 'Detské sety' }] },
            { name: 'Obuv', menu_name: 'Obuv', sub: [{ name: 'Dámska obuv' }, { name: 'Pánska obuv' }, { name: 'Detská obuv' }] },
            { name: 'Doplnky a módne doplnky pre každú príležitosť', menu_name: 'Doplnky', sub: [{ name: 'Tašky a kabelky' }, { name: 'Šály a čiapky' }, { name: 'Opasky a šperky' }] },
            { name: 'Športové oblečenie a fitness výbava pre aktívnych', menu_name: 'Šport', sub: [{ name: 'Tréningové oblečenie' }, { name: 'Cyklistika' }, { name: 'Beh a fitness' }] },
            { name: 'Outdoor a turistika', menu_name: 'Outdoor', sub: [{ name: 'Turistické bundy' }, { name: 'Turistické nohavice' }] },
            { name: 'Spodné prádlo a pyžamá pre pohodlný domov', menu_name: 'Spodné prádlo', sub: [{ name: 'Dámske prádlo' }, { name: 'Pánske prádlo' }] },
            { name: 'Šaty, sukne a kombinézy pre každú príležitosť', menu_name: 'Šaty a sukne', sub: [{ name: 'Letné šaty' }, { name: 'Večerné šaty' }, { name: 'Sukne' }] },
            { name: 'Kabáty, bundy a vetrovky na jeseň a zimu', menu_name: 'Kabáty a bundy', sub: [{ name: 'Zimné kabáty' }, { name: 'Prechodné bundy' }, { name: 'Vetrovky' }] },
            { name: 'Svetre, mikiny a kardigány pre chladné dni', menu_name: 'Svetre a mikiny', sub: [{ name: 'Svetre' }, { name: 'Mikiny s kapucňou' }, { name: 'Kardigány' }] },
            { name: 'Výpredaj a špeciálne ponuky sezónnych kolekcií za zvýhodnené ceny', menu_name: 'Výpredaj', sub: [] },
            { name: 'Plážová a letná móda', menu_name: 'Plážová móda', sub: [{ name: 'Plavky dámske' }, { name: 'Plavky pánske' }, { name: 'Plážové doplnky' }] },
            { name: 'Pracovné a ochranné odevy', menu_name: 'Pracovné odevy', sub: [{ name: 'Reflexné vesty' }, { name: 'Pracovné nohavice' }, { name: 'Ochranná obuv' }] },
            { name: 'Školská a detská uniforma', menu_name: 'Uniformy', sub: [{ name: 'Školská uniforma' }, { name: 'Športové súpravy' }] },
            { name: 'Tašky, kufre a batožina', menu_name: 'Tašky a kufre', sub: [{ name: 'Cestovné kufre' }, { name: 'Mestské tašky' }, { name: 'Turistické batohy' }] },
            { name: 'Šperky a bižutéria', menu_name: 'Šperky', sub: [{ name: 'Náhrdelníky' }, { name: 'Náušnice' }, { name: 'Prstene' }] },
            { name: 'Hodinky a módne doplnky', menu_name: 'Hodinky', sub: [{ name: 'Dámske hodinky' }, { name: 'Pánske hodinky' }] },
            { name: 'Nočná bielizeň a domáce oblečenie', menu_name: 'Domáce odevy', sub: [{ name: 'Pyžamá' }, { name: 'Župany' }, { name: 'Pantofle' }] },
            { name: 'Tehotenská a dojčiaca móda', menu_name: 'Tehotenská', sub: [{ name: 'Tehotenské šaty' }, { name: 'Dojčiace blúzy' }] },
            { name: 'Luxusná a designérska móda', menu_name: 'Luxusná móda', sub: [{ name: 'Designérske kabelky' }, { name: 'Prémiové oblečenie' }] },
            { name: 'Svadobná a spoločenská kolekcia', menu_name: 'Svadobná', sub: [{ name: 'Svadobné šaty' }, { name: 'Spoločenské obleky' }] },
            { name: 'Ekologická a udržateľná móda', menu_name: 'Eko móda', sub: [] },
        ],
        productAdj: ['Dámsky', 'Pánsky', 'Športový', 'Zimný', 'Letný', 'Prémiový', 'Trendy', 'Slim-fit', 'Exkluzívny limitovaný organický udržateľný'],
        productNoun: ['bunda', 'tričko', 'nohavice', 'šaty', 'sveter', 'mikina', 'kabát', 'legíny', 'multifunkčná softshellová bunda s odnímateľnou kapucňou'],
        productExtra: ['100% bavlna', 'vodoodolný', 's kapucňou', 'slim fit', 'oversize strih', 'veľkosť M–XXL', 'organická bavlna', 'recyklovaný materiál', 's reflexnými prvkami, zateplením a zárukou kvality'],
        sections: [
            { id: 1, name: 'Informácie' },
            { id: 2, name: 'O spoločnosti', parent_id: 1 },
            { id: 3, name: 'O nákupe', parent_id: 1 },
            { id: 4, name: 'Blog' },
            { id: 5, name: 'Módne tipy', parent_id: 4 },
            { id: 6, name: 'Novinky', parent_id: 4 },
            { id: 7, name: 'Udržateľná móda', parent_id: 4 },
            { id: 8, name: 'Outdoor a šport', parent_id: 4 },
            { id: 9, name: 'Starostlivosť o oblečenie', parent_id: 4 },
            { id: 10, name: 'Aktuality', parent_id: 1 },
            { id: 11, name: 'Vrátenie a reklamácie', parent_id: 3 },
            { id: 12, name: 'Sezónne kolekcie', parent_id: 6 },
            { id: 13, name: 'Dámska móda', parent_id: 5 },
            { id: 14, name: 'Pánska móda', parent_id: 5 },
            { id: 15, name: 'Detská móda', parent_id: 5 },
            { id: 16, name: 'Luxusná móda', parent_id: 5 },
            { id: 17, name: 'Fitnes a wellness', parent_id: 8 },
            { id: 18, name: 'Módne trendy', parent_id: 5 },
            { id: 19, name: 'Prázdninové inšpirácie', parent_id: 5 },
            { id: 20, name: 'Kapsulový šatník', parent_id: 5 },
            { id: 21, name: 'Veľkostný sprievodca', parent_id: 3 },
            { id: 22, name: 'Etická a ekologická móda', parent_id: 7 },
            { id: 23, name: 'Kariéra', parent_id: 1 },
            { id: 24, name: 'Časté otázky', parent_id: 1 },
        ],
        articles: [
            { id: 1, name: 'Obchodné podmienky', section_id: 3, legal: true },
            { id: 2, name: 'Reklamačné podmienky', section_id: 3, legal: true },
            { id: 3, name: 'Doprava a platba', section_id: 3, legal: true },
            { id: 4, name: 'Ako vybrať správnu veľkosť', section_id: 21 },
            { id: 5, name: 'Trendy na jarnú sezónu', section_id: 18 },
            { id: 6, name: 'Udržateľná móda — čo to znamená?', section_id: 7 },
            { id: 7, name: 'Novinky v kolekcii', section_id: 6 },
            { id: 8, name: 'Ako správne prať a skladovať oblečenie', section_id: 9 },
            { id: 9, name: 'Kompletný sprievodca výberom oblečenia', section_id: 5 },
            { id: 10, name: 'Outdoor oblečenie — na čo si dať pozor', section_id: 8 },
            { id: 11, name: 'Kapsulový šatník — základ moderného šatníka', section_id: 20 },
            { id: 12, name: 'Nová zimná kolekcia je tu', section_id: 12 },
            { id: 13, name: 'Módne trendy 2024 pre ženy', section_id: 13 },
            { id: 14, name: 'Pánsky šatník — čo by nemalo chýbať', section_id: 14 },
            { id: 15, name: 'Oblečenie pre deti — komfort a štýl', section_id: 15 },
            { id: 16, name: 'Eco móda — ako nakupovať zodpovedne', section_id: 22 },
            { id: 17, name: 'Jarná kolekcia 2024 — prehľad noviniek', section_id: 12 },
            { id: 18, name: 'Fitness oblečenie — čo je dôležité', section_id: 17 },
            { id: 19, name: 'Letné šaty — inšpirujte sa', section_id: 19 },
            { id: 20, name: 'Luxusná móda — na čo si dať pozor', section_id: 16 },
            { id: 21, name: 'Ako sa starať o kašmírový sveter', section_id: 9 },
            { id: 22, name: 'Letná výpredaj — kde hľadať najlepšie kúsky', section_id: 6 },
            { id: 23, name: 'Streetwear — módny smer mladých', section_id: 18 },
            { id: 24, name: 'Recyklované tkaniny — nový trend módy', section_id: 22 },
            { id: 25, name: 'Outdoor bundy — porovnanie materiálov', section_id: 8 },
            { id: 26, name: 'Módne doplnky — ako kompletizovať outfit', section_id: 5 },
        ],
        faqSections: [
            { name: 'Veľkostné tabuľky' },
            { name: 'Vrátenie a výmena tovaru' },
            { name: 'Starostlivosť o oblečenie' },
            { name: 'Doručenie' },
            { name: 'Platby' },
            { name: 'Záruka' },
            { name: 'Udržateľnosť' },
            { name: 'Darčeky a poukazy' },
            { name: 'Vernostný program' },
            { name: 'Outdoor oblečenie' },
            { name: 'Šport a fitness' },
            { name: 'Detské oblečenie' },
            { name: 'Kapsulový šatník' },
            { name: 'Luxusná móda' },
            { name: 'Zákaznícky servis' },
            { name: 'Akcie a zľavy' },
            { name: 'Pranie a symboly' },
            { name: 'Materiály a alergény' },
            { name: 'Svadobná a spoločenská' },
            { name: 'Pracovné odevy' },
            { name: 'Firemné objednávky' },
            { name: 'Sezónne kolekcie' },
            { name: 'Opravy a úpravy' },
            { name: 'Šperky a doplnky' },
        ],
        faqs: [
            { faq_section_id: 1, name: 'Ako zistím svoju správnu veľkosť?', description: FAQ_DESC },
            { faq_section_id: 1, name: 'Sú veľkosti konzistentné naprieč značkami?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Môžem vrátiť tovar bez udania dôvodu?', description: FAQ_DESC },
            { faq_section_id: 2, name: 'Ako prebieha výmena za inú veľkosť?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Ako prať vlnené svetre aby sa nezrazili?', description: FAQ_DESC },
            { faq_section_id: 3, name: 'Čo znamenajú symboly na štítku oblečenia?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Ako dlho trvá doručenie?', description: FAQ_DESC },
            { faq_section_id: 4, name: 'Je možné vyzdvihnutie v predajni?', description: FAQ_DESC },
            { faq_section_id: 5, name: 'Aké platobné metódy prijímate?', description: FAQ_DESC },
            { faq_section_id: 6, name: 'Aká je záručná doba na oblečenie?', description: FAQ_DESC },
            { faq_section_id: 7, name: 'Predávate oblečenie z organickej bavlny?', description: FAQ_DESC },
            { faq_section_id: 8, name: 'Ako zakúpiť darčekový poukaz?', description: FAQ_DESC },
            { faq_section_id: 9, name: 'Ako funguje vernostný program?', description: FAQ_DESC },
            { faq_section_id: 10, name: 'Aký materiál je vhodný na turistiku?', description: FAQ_DESC },
            { faq_section_id: 11, name: 'Aké oblečenie je vhodné na fitnes?', description: FAQ_DESC },
            { faq_section_id: 12, name: 'Aké veľkosti máte pre deti?', description: FAQ_DESC },
            { faq_section_id: 13, name: 'Čo je kapsulový šatník?', description: FAQ_DESC },
            { faq_section_id: 14, name: 'Predávate originálne dizajnérske kúsky?', description: FAQ_DESC },
            { faq_section_id: 15, name: 'Ako vás môžem kontaktovať?', description: FAQ_DESC },
            { faq_section_id: 16, name: 'Kedy sú sezónne výpredaje?', description: FAQ_DESC },
            { faq_section_id: 17, name: 'Môžem prať kašmír v práčke?', description: FAQ_DESC },
            { faq_section_id: 18, name: 'Máte alergénne testované materiály?', description: FAQ_DESC },
            { faq_section_id: 19, name: 'Ponúkate svadobné šaty?', description: FAQ_DESC },
            { faq_section_id: 20, name: 'Máte pracovné oblečenie pre firmy?', description: FAQ_DESC },
        ],
        branches: [...DUMMY_BRANCHES],
        benefits: [
            { id: 1, name: 'Bezplatné vrátenie', description: '<p>Vrátenie tovaru do 30 dní zadarmo bez udania dôvodu.</p>' },
            { id: 2, name: 'Rýchle doručenie', description: '<p>Doručenie do 48 hodín pri objednávke do 12:00.</p>' },
            { id: 3, name: 'Veľkostný sprievodca', description: '<p>Podrobná tabuľka veľkostí pre každú značku.</p>' },
            { id: 4, name: 'Udržateľná móda', description: '<p>Rastúci sortiment eco-friendly a udržateľných odevov.</p>' },
            { id: 5, name: 'Bezpečné platby', description: '<p>Šifrované platby s najvyšším stupňom ochrany.</p>' },
            { id: 6, name: 'Výmena za inú veľkosť', description: '<p>Bezplatná výmena za inú veľkosť do 60 dní.</p>' },
            { id: 7, name: 'Darčekové balenie', description: '<p>Elegantné darčekové balenie zadarmo.</p>' },
            { id: 8, name: 'Vernostný program', description: '<p>Zbierajte body za nákupy a získajte zľavy.</p>' },
            { id: 9, name: 'Originálne značky', description: '<p>Iba originálne produkty od autorizovaných predajcov.</p>' },
            { id: 10, name: 'Doprava zadarmo', description: '<p>Doprava zadarmo pri objednávke nad 60 €.</p>' },
            { id: 11, name: 'Zákaznícka podpora', description: '<p>Módni poradcovia k dispozícii každý deň.</p>' },
            { id: 12, name: 'Sezónne kolekcie', description: '<p>Nové kolekcie každú sezónu priamo od výrobcov.</p>' },
            { id: 13, name: 'Click & Collect', description: '<p>Objednajte online a vyzdvihnite v predajni.</p>' },
            { id: 14, name: 'Firemné oblečenie', description: '<p>Špeciálne ceny pre firemné objednávky.</p>' },
            { id: 15, name: 'Outdoor sekcia', description: '<p>Špeciálna sekcia pre outdoorové a turistické oblečenie.</p>' },
            { id: 16, name: 'Exkluzívne značky', description: '<p>Prístup k exkluzívnym dizajnérskym značkám.</p>' },
            { id: 17, name: 'Opravy a úpravy', description: '<p>Kravčírske úpravy oblečenia na mieru.</p>' },
            { id: 18, name: 'Newsletter zľava', description: '<p>Prihláste sa k odberu a získajte 10 % zľavu.</p>' },
            { id: 19, name: 'Módne poradenstvo', description: '<p>Bezplatné módne poradenstvo od štylistov.</p>' },
            { id: 20, name: 'Zberateľské edície', description: '<p>Limitované edície od renomovaných dizajnérov.</p>' },
            { id: 21, name: 'Prémiové materiály', description: '<p>Oblečenie z prémiovej vlny, kašmíru a organickej bavlny.</p>' },
            { id: 22, name: 'Recycled fashion', description: '<p>Oblečenie z recyklovaných materiálov pre udržateľný životný štýl.</p>' },
            { id: 23, name: 'Detská sekcia', description: '<p>Bezpečné a pohodlné oblečenie pre najmenších.</p>' },
            { id: 24, name: 'Svadobná kolekcia', description: '<p>Exkluzívny výber svadobných a spoločenských odevov.</p>' },
        ],
        testimonials: [
            { id: 1, name: 'Zuzana Horáková', description: '<p>Bezplatné vrátenie do 30 dní — konečne nakupujem oblečenie online bez obáv.</p>' },
            { id: 2, name: 'Matej Valko', description: '<p>Veľkostný sprievodca je výborný — trafil som veľkosť na prvýkrát.</p>' },
            { id: 3, name: 'Renáta Poláková', description: '<p>Udržateľná móda — šatník, na ktorý som hrdá. Skvelý výber eco oblečenia.</p>' },
            { id: 4, name: 'Ladislav Oravec', description: '<p>Darčekové balenie pre manželku — bola nadšená. Elegantné a rýchle.</p>' },
            { id: 5, name: 'Petra Holečková', description: '<p>Módne poradenstvo od štylistov zadarmo — pomohlo mi zostaviť celý outfit.</p>' },
            { id: 6, name: 'Ján Kováčik', description: '<p>Výmena za inú veľkosť do 60 dní — super, keď sa neviem rozhodnúť.</p>' },
            { id: 7, name: 'Ivana Gregorová', description: '<p>Sezónne kolekcie priamo od výrobcov — vždy niečo nové a štýlové.</p>' },
            { id: 8, name: 'Tibor Sedlák', description: '<p>Firemné oblečenie s faktúrou — jednoduchá objednávka pre celý tím.</p>' },
            { id: 9, name: 'Alena Lukáčová', description: '<p>Kravčírske úpravy na mieru — sako sedí perfektne.</p>' },
            { id: 10, name: 'Miroslav Fekete', description: '<p>Exkluzívne značky, ktoré inde nenájdem. Moja adresa pre prémiovú módu.</p>' },
            { id: 11, name: 'Marta Blahová', description: '<p>Vernostný program — zbierám body pri každom nákupe a šetrím.</p>' },
            { id: 12, name: 'Ondrej Krajčí', description: '<p>Outdoor sekcia je výborná — kompletná výbava na turistiku na jednom mieste.</p>' },
            { id: 13, name: 'Soňa Mináčová', description: '<p>Newsletter zľava 10 % — hneď som ju využila pri prvom nákupe.</p>' },
            { id: 14, name: 'Rastislav Novák', description: '<p>Click & Collect — objednala som večer, vyzdvihla ráno. Skvelá služba.</p>' },
            { id: 15, name: 'Lucia Babičová', description: '<p>Prémiové materiály — kašmírový sveter je naozaj kvalitný a mäkký.</p>' },
            { id: 16, name: 'Dušan Kopál', description: '<p>Recycled fashion — oblečenie z recyklovaných materiálov vyzerá skvelo.</p>' },
            { id: 17, name: 'Gabriela Šimková', description: '<p>Detská sekcia je krásna — pohodlné a bezpečné oblečenie pre synčeka.</p>' },
            { id: 18, name: 'Michal Janáč', description: '<p>Doprava zadarmo pri objednávke nad 60 € — nakupujem väčšie sety.</p>' },
            { id: 19, name: 'Viera Kováčová', description: '<p>Svadobná kolekcia — šaty boli dokonalé. Ďakujem za krásny deň!</p>' },
            { id: 20, name: 'Peter Horný', description: '<p>Originálne značky za výborné ceny. Nakupujem tu každú sezónu.</p>' },
            { id: 21, name: 'Jana Slobodová', description: '<p>Zákaznícka podpora módnych poradcov — pomohli mi zostaviť celý šatník.</p>' },
            { id: 22, name: 'Ľubomír Vašek', description: '<p>Zberateľské edície od dizajnérov — vlastním unikátne kúsky, na ktoré som hrdý.</p>' },
            { id: 23, name: 'Dagmar Nováková', description: '<p>Bezpečné platby a jednoduchý nákupný proces. Odporúčam každej módnej nadšenkyni.</p>' },
            { id: 24, name: 'Karol Gál', description: '<p>Vrátenie bez otázok — profesionálny prístup, ktorý si zaslúži ocenenie.</p>' },
        ],
    },
};

// ── Selection helpers ─────────────────────────────────────────────────────────

function pickRandom(arr, n) {
    if (!arr || arr.length === 0 || n <= 0) return [];
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
}

function pickFirst(arr, n) {
    if (!arr || arr.length === 0 || n <= 0) return [];
    return arr.slice(0, Math.min(n, arr.length));
}

function selectCategories(pool, count, subMax) {
    const selected = pickRandom(pool, count);
    return selected.map((cat) => {
        const n = Math.floor(Math.random() * (subMax + 1));
        if (n === 0) return { ...cat, sub: [] };
        const base = cat.sub || [];
        // Pad with generated entries if the data pool is smaller than requested
        const padded = [...base];
        const label = cat.menu_name || cat.name;
        while (padded.length < n) {
            padded.push({ name: `${label} ${padded.length + 1}` });
        }
        return { ...cat, sub: pickRandom(padded, n) };
    });
}

// ── PHP helpers ───────────────────────────────────────────────────────────────

function phpStr(s) {
    return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function toPhpInlineArray(arr) {
    return '[' + arr.map(phpStr).join(', ') + ']';
}

function toPhpArray(value, indent = 0) {
    const pad = '    '.repeat(indent);
    const inner = '    '.repeat(indent + 1);

    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return phpStr(value);

    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map((v) => `${inner}${toPhpArray(v, indent + 1)}`);
        return `[\n${items.join(',\n')},\n${pad}]`;
    }

    const entries = Object.entries(value);
    if (entries.length === 0) return '[]';
    const items = entries.map(([k, v]) => `${inner}${phpStr(k)} => ${toPhpArray(v, indent + 1)}`);
    return `[\n${items.join(',\n')},\n${pad}]`;
}

// ── PHP file generation ───────────────────────────────────────────────────────

function generatePhpContent(typeData, opts, counts) {
    const productCount = counts.products ?? 128;
    const articleCount = counts.articles ?? 12;

    // Select data subsets based on counts
    const selectedManufacturers = opts.manufacturers
        ? pickRandom(typeData.manufacturers, counts.manufacturers ?? typeData.manufacturers.length)
        : typeData.manufacturers;
    const selectedCategories = opts.categories
        ? selectCategories(typeData.categories, counts.categories ?? typeData.categories.length, counts.subCategoriesMax ?? 12)
        : typeData.categories;
    const selectedBranches = opts.branches
        ? pickRandom(typeData.branches, counts.branches ?? typeData.branches.length)
        : typeData.branches;
    const selectedBenefits = opts.benefits
        ? pickRandom(typeData.benefits, counts.benefits ?? typeData.benefits.length).map((b, i) => ({ ...b, id: i + 1 }))
        : typeData.benefits;
    const selectedSections = opts.sections
        ? pickFirst(typeData.sections, counts.sections ?? typeData.sections.length)
        : typeData.sections;
    const selectedFaqSections = opts.faqSections
        ? pickFirst(typeData.faqSections, counts.faqSections ?? typeData.faqSections.length)
        : typeData.faqSections;
    const selectedFaqs = opts.faqs
        ? pickFirst(
              typeData.faqs.filter((f) => f.faq_section_id <= selectedFaqSections.length),
              counts.faqs ?? typeData.faqs.length
          )
        : typeData.faqs;
    const selectedTestimonials = opts.testimonials
        ? pickRandom(typeData.testimonials, counts.testimonials ?? typeData.testimonials.length).map((t, i) => ({ ...t, id: i + 1 }))
        : typeData.testimonials;

    const b = (v) => (v ? 'true' : 'false');

    // Build article list filtered to valid section_ids only
    const selectedSectionIds = new Set(selectedSections.map((s) => s.id));
    const legalArticles = typeData.articles.filter((a) => a.legal && selectedSectionIds.has(a.section_id));
    const blogArticles = typeData.articles.filter((a) => !a.legal && selectedSectionIds.has(a.section_id));
    const selectedBlogArticles = [];
    if (blogArticles.length > 0) {
        for (let i = 0; i < articleCount; i++) {
            selectedBlogArticles.push(blogArticles[i % blogArticles.length]);
        }
    }
    const allArticles = [...legalArticles, ...selectedBlogArticles];

    // Re-assign sequential IDs
    const articlesWithIds = allArticles.map((a, idx) => ({ ...a, id: idx + 1 }));

    const sectionsPhp = selectedSections
        .map(({ id, ...rest }) => `    ${id} => ${toPhpArray(rest, 1)}`)
        .join(',\n');

    const articlesPhp = articlesWithIds
        .map(({ id, legal, ...rest }) => {
            const full = legal
                ? { ...rest, short_description: 'short todo', description: 'long todo' }
                : { ...rest, short_description: ARTICLE_SHORT, description: ARTICLE_LONG };
            return `    ${id} => ${toPhpArray(full, 1)}`;
        })
        .join(',\n');

    const benefitsPhp = selectedBenefits
        .map(({ id, ...rest }) => `    ${id} => ${toPhpArray(rest, 1)}`)
        .join(',\n');

    const adjPhp = toPhpInlineArray(typeData.productAdj);
    const nounPhp = toPhpInlineArray(typeData.productNoun);
    const extraPhp = toPhpInlineArray(typeData.productExtra);

    const faqSectionsPhp = toPhpArray(selectedFaqSections);
    const faqsPhp = toPhpArray(selectedFaqs);

    const testimonialsPhp = selectedTestimonials
        .map(({ id, ...rest }) => `    ${id} => ${toPhpArray(rest, 1)}`)
        .join(',\n');


    return `<?php
/**
 * This file is part of rshop/app project.
 *
 * (c) RIESENIA.com
 */

namespace App\\Config\\BasicSeed;

$data = [];

/* options */
$options = [
    'manufacturers' => ${b(opts.manufacturers)},
    'properties' => ${b(opts.properties)},
    'categories' => ${b(opts.categories)}, // Dependencies: properties
    'products' => ${b(opts.products)}, // Dependencies: categories, manufacturers, properties
    'branches' => ${b(opts.branches)},
    'benefits' => ${b(opts.benefits)},
    'sections' => ${b(opts.sections)},
    'articles' => ${b(opts.articles)}, // Dependencies: sections
    'faqSections' => ${b(opts.faqSections)},
    'faqs' => ${b(opts.faqs)}, // Dependencies: faqSections
    'testimonials' => ${b(opts.testimonials)},
];

/* data */
$manufacturers = ${toPhpInlineArray(selectedManufacturers)};

$productTypes = ${toPhpArray(typeData.productTypes)};

$productTypeUnits = ${toPhpInlineArray(typeData.productTypeUnits)};

$properties = ${toPhpArray(typeData.properties)};

$productTypeOptions = ${toPhpArray(typeData.productTypeOptions)};

$categories = ${toPhpArray(selectedCategories)};

$benefits = [
${benefitsPhp},
];

$branches = ${toPhpArray(selectedBranches)};

$sections = [
${sectionsPhp},
];

$articles = [
${articlesPhp},
];

$faqSections = ${faqSectionsPhp};

$faqs = ${faqsPhp};

$testimonials = [
${testimonialsPhp},
];

/* execution */
if ($options['manufacturers'] && \\count($manufacturers) > 0) {
    $tmpCount = 0;

    $data['Rshop/Admin.Manufacturers'] = [
        '_defaults' => [],
    ];

    foreach ($manufacturers as $name) {
        $data['Rshop/Admin.Manufacturers'][] = [
            'id' => ++$tmpCount,
            'name' => $name,
            'description' => '${LOREM_DESC}'
        ];
    }
}

if ($options['properties']) {
    if (\\count($productTypeUnits) > 0) {
        $tmpCount = 0;

        $data['Rshop/Admin.ProductTypeUnits'] = [
            '_defaults' => [],
        ];

        foreach ($productTypeUnits as $name) {
            $data['Rshop/Admin.ProductTypeUnits'][] = [
                'id' => ++$tmpCount,
                'unit' => $name,
                'format' => 'after'
            ];
        }
    }

    if (\\count($properties) > 0) {
        $tmpCount = 0;

        $data['Rshop/Admin.Properties'] = [
            '_defaults' => [],
        ];

        foreach ($properties as $property) {
            $data['Rshop/Admin.Properties'][] = [
                'id' => ++$tmpCount,
                'name' => $property['name'],
                'type' => $property['type'],
                'product_type_unit_group_id' => $property['product_type_unit_group_id'] ?? null,
            ];
        }
    }

    if (\\count($productTypes) > 0) {
        $tmpCount = 0;
        $tmpGroupCount = 0;

        $data['Rshop/Admin.ProductTypes'] = [
            '_defaults' => [],
        ];
        $data['Rshop/Admin.ProductTypeGroups'] = [
            '_defaults' => [],
        ];
        $data['Rshop/Admin.ProductTypeProperties'] = [
            '_defaults' => [],
        ];
        $data['Rshop/Admin.ProductPropertyValues'] = [
            '_defaults' => [],
        ];

        foreach ($productTypes as $type) {
            $data['Rshop/Admin.ProductTypes'][] = [
                'id' => ++$tmpCount,
                'name' => $type['name'],
            ];

            if ($type['groups']) {
                foreach ($type['groups'] as $group) {
                    $data['Rshop/Admin.ProductTypeGroups'][] = [
                        'id' => ++$tmpGroupCount,
                        'product_type_id' => $tmpCount,
                        'name' => $group['name'],
                        'sort' => $tmpGroupCount
                    ];
                }
            }
        }

        foreach ($productTypeOptions as $typeOption) {
            $data['Rshop/Admin.ProductTypeOptions'][] = [
                'id' => ++$tmpCount,
                'property_id' => $typeOption['property_id'],
                'value' => $typeOption['value'],
                'description' => $typeOption['description'] ?? '',
            ];
        }
    }
}

if ($options['categories'] && \\count($categories) > 0) {
    $tmpCount = 0;

    $data['Rshop/Admin.Categories'] = [
        '_defaults' => [],
    ];

    foreach ($categories as $category) {
        $data['Rshop/Admin.Categories'][] = [
            'id' => ++$tmpCount,
            'name' => $category['name'],
            'menu_name' => $category['menu_name'] ?? null,
            'parent_id' => null,
            'display' => $category['display'] ?? 1,
            'show_in_main_menu' => $category['show_in_main_menu'] ?? 1,
            'show_subcategories' => $category['show_subcategories'] ?? 1,
            'active' => $category['active'] ?? 1,
            'has_active_path' => $category['has_active_path'] ?? 1,
            'description' => '${LOREM_DESC}',
            'product_type_id' => $category['product_type_id'] ?? 1,
            'sort' => $tmpCount
        ];

        if ($category['sub']) {
            $parentId = $tmpCount;

            foreach ($category['sub'] as $subCategory) {
                $data['Rshop/Admin.Categories'][] = [
                    'id' => ++$tmpCount,
                    'name' => $subCategory['name'],
                    'menu_name' => $subCategory['menu_name'] ?? null,
                    'parent_id' => $parentId,
                    'display' => $subCategory['display'] ?? 1,
                    'show_in_main_menu' => $subCategory['show_in_main_menu'] ?? 1,
                    'active' => $subCategory['active'] ?? 1,
                    'has_active_path' => $subCategory['has_active_path'] ?? 1,
                    'description' => '${LOREM_DESC}'
                ];

                if (isset($subCategory['sub']) && $subCategory['sub']) {
                    $subParentId = $tmpCount;

                    foreach ($subCategory['sub'] as $subSubCategory) {
                        $data['Rshop/Admin.Categories'][] = [
                            'id' => ++$tmpCount,
                            'name' => $subSubCategory['name'],
                            'menu_name' => $subSubCategory['menu_name'] ?? null,
                            'parent_id' => $subParentId,
                            'display' => $subSubCategory['display'] ?? 1,
                            'show_in_main_menu' => $subSubCategory['show_in_main_menu'] ?? 1,
                            'active' => $subSubCategory['active'] ?? 1,
                            'has_active_path' => $subSubCategory['has_active_path'] ?? 1,
                            'description' => '${LOREM_DESC}'
                        ];
                    }
                }
            }
        }

        $categoriesCount = $tmpCount;
    }
}

if ($options['products']) {
    $tmpAdditional1 = ${adjPhp};
    $tmpNames = ${nounPhp};
    $tmpAdditional2 = ${extraPhp};
    $tmpShortDesc = ['Cupcake ipsum dolor sit amet. Halvah cake I love I love pie dragée cotton candy cupcake. Marshmallow cake topping candy canes dessert chocolate pie. Cotton candy fruitcake marshmallow candy lemon drops.'];
    $tmpVolume = ['180', '250', '350', '420', '500', '750', '1250'];
    $tmpPriceId = 0;

    // Clean up products and their prices from previous seed runs
    $this->loadModel('Rshop/Admin.ProductPrices')->deleteAll([]);
    $this->loadModel('Rshop/Admin.CategoriesProducts')->deleteAll([]);
    $this->loadModel('Rshop/Admin.Products')->deleteAll([]);

    $data['Rshop/Admin.Products'] = [
        '_defaults' => [],
    ];

    $data['Rshop/Admin.ProductPrices'] = [
        '_defaults' => [],
    ];

    for ($i = 0; $i < ${productCount}; ++$i) {
        $data['Rshop/Admin.Products'][] = [
            'id' => $i + 1,
            'name' => $tmpAdditional1[\\array_rand($tmpAdditional1)] . ' ' . $tmpNames[\\array_rand($tmpNames)] . ' ' . $tmpAdditional2[\\array_rand($tmpAdditional2)],
            'model' => \\rand(1000000, 9000000) . $i,
            'ean' => 'ean-' . $i . '-' . $i,
            'stock' => (\\rand(1, 2) == 1 ? \\rand(0, 4) : \\rand(17, 44)),
            'short_description' => $tmpShortDesc[\\array_rand($tmpShortDesc)],
            'description' => '${LOREM_DESC}',
            'manufacturer_id' => \\rand(1, \\count($manufacturers)),
            'tax_class_id' => 1,
            'active' => 1,
            'product_type_id' => \\rand(1, \\count($productTypes)),
            'volume' => $tmpVolume[\\array_rand($tmpVolume)]
        ];
        $data['Rshop/Admin.CategoriesProducts'][] = [
            'id' => $i + 1,
            'product_id' => $i + 1,
            'category_id' => \\rand(1, $categoriesCount)
        ];
        $data['Rshop/Admin.ProductPrices'][] = [
            'id' => ++$tmpPriceId,
            'product_id' => $i + 1,
            'price_type_id' => 1,
            'price' => ($tmpPrice = (\\rand(1, 6) == 1 ? \\rand(200, 12000) : \\rand(4, 199))),
            'price_vat' => $tmpPrice * 1.2
        ];

        if ($tmpPriceId % 5 == 0) {
            $data['Rshop/Admin.ProductPrices'][] = [
                'id' => ++$tmpPriceId,
                'product_id' => $i + 1,
                'price_type_id' => 2,
                'price' => ($tmpDiscountedPrice = $tmpPrice - \\rand(1, $tmpPrice - 3)),
                'price_vat' => $tmpDiscountedPrice * 1.2
            ];
        }
    }
}

if ($options['benefits'] && $benefits) {
    $tmpCount = 0;

    $data['Rshop/Admin.Benefits'] = [
        '_defaults' => [
            'icon' => '',
            'active' => 1
        ],
    ];

    foreach ($benefits as $benefitId => $benefit) {
        $data['Rshop/Admin.Benefits'][] = [
            'id' => $benefitId,
            'name' => $benefit['name'] ?? '',
            'description' => $benefit['description'] ?? '',
            'url' => $benefit['url'] ?? '#',
            'image' => $benefit['image'] ?? '',
            'sort' => ++$tmpCount,
        ];
    }
}

if ($options['branches'] && \\count($branches) > 0) {
    $tmpCount = 0;

    $data['Rshop/Admin.Branches'] = [
        '_defaults' => [],
    ];

    foreach ($branches as $branch) {
        $data['Rshop/Admin.Branches'][] = [
            'id' => ++$tmpCount,
            'name' => $branch['name'] ?? '-',
            'street' => $branch['street'] ?? '-',
            'street2' => $branch['street2'] ?? null,
            'city' => $branch['city'] ?? '-',
            'post_code' => $branch['post_code'] ?? '-',
            'country_id' => $branch['country_id'] ?? null,
            'state_id' => $branch['state_id'] ?? null,
            'description' => $branch['description'] ?? null,
            'email' => $branch['email'] ?? 'rshop@rshop.sk',
            'phone' => $branch['phone'] ?? null,
            'phone2' => $branch['phone2'] ?? null,
            'longitude' => $branch['longitude'] ?? null,
            'latitude' => $branch['latitude'] ?? null,
            'heureka_id' => $branch['heureka_id'] ?? null,
            'parking' => $branch['parking'] ?? null,
            'payment' => $branch['payment'] ?? null,
            'video' => $branch['video'] ?? null,
            'lunch_break' => $branch['lunch_break'] ?? null,
            'map_link' => $branch['map_link'] ?? null,
            'map_image' => $branch['map_image'] ?? null,
            'display' => $branch['display'] ?? 1,
            'is_active' => $branch['is_active'] ?? 1,
            'is_pickup' => $branch['is_pickup'] ?? 0,
            'sort' => $tmpCount,
        ];
    }
}

if ($options['sections'] && $sections) {
    $tmpCount = 0;

    $data['Rshop/Admin.Sections'] = [
        '_defaults' => [],
    ];

    foreach ($sections as $sectionId => $section) {
        $data['Rshop/Admin.Sections'][] = [
            'id' => $sectionId,
            'name' => $section['name'] ?? '',
            'parent_id' => $section['parent_id'] ?? null,
            'active' => $section['active'] ?? 1,
            'display' => $section['display'] ?? 1,
            'sort' => ++$tmpCount,
        ];
    }
}

if ($options['articles'] && $articles) {
    $tmpCount = 0;

    $data['Rshop/Admin.Articles'] = [
        '_defaults' => [],
    ];

    foreach ($articles as $articleId => $article) {
        $data['Rshop/Admin.Articles'][] = [
            'id' => $articleId,
            'name' => $article['name'] ?? '',
            'section_id' => $article['section_id'] ?? null,
            'active' => $article['active'] ?? 1,
            'short_description' => $article['short_description'] ?? '',
            'description' => $article['description'] ?? '',
            'sort' => ++$tmpCount,
        ];
    }
}

if ($options['faqSections'] && \\count($faqSections) > 0) {
    $tmpCount = 0;
    $data['Rshop/Content.FaqSections'] = ['_defaults' => ['active' => 1]];
    foreach ($faqSections as $section) {
        $data['Rshop/Content.FaqSections'][] = [
            'id' => ++$tmpCount,
            'name' => $section['name'],
            'parent_id' => $section['parent_id'] ?? null,
            'sort' => $tmpCount,
        ];
    }
}

if ($options['faqs'] && \\count($faqs) > 0) {
    $tmpCount = 0;
    $data['Rshop/Content.Faqs'] = ['_defaults' => ['active' => 1]];
    foreach ($faqs as $faq) {
        $data['Rshop/Content.Faqs'][] = [
            'id' => ++$tmpCount,
            'faq_section_id' => $faq['faq_section_id'],
            'name' => $faq['name'],
            'description' => $faq['description'],
            'sort' => $tmpCount,
        ];
    }
}

if ($options['testimonials'] && $testimonials) {
    $tmpCount = 0;

    $data['Rshop/Admin.Testimonials'] = [
        '_defaults' => [
            'image' => '',
            'active' => 1
        ],
    ];

    foreach ($testimonials as $testimonialId => $testimonial) {
        $data['Rshop/Admin.Testimonials'][] = [
            'id' => $testimonialId,
            'name' => $testimonial['name'] ?? '',
            'image' => $testimonial['image'] ?? '',
            'description' => $testimonial['description'] ?? '',
            'sort' => ++$tmpCount,
        ];
    }
}

$this->importTables($data);
`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STANDARD_COUNT_OPTIONS = [
    { value: 1, label: '1' },
    { value: 4, label: '4' },
    { value: 12, label: '12 (default)' },
    { value: 24, label: '24' },
    { value: 'custom', label: 'Vlastný počet...' },
];

const PRODUCT_COUNT_OPTIONS = [
    { value: 48, label: '48' },
    { value: 128, label: '128 (default)' },
    { value: 256, label: '256' },
    { value: 'custom', label: 'Vlastný počet...' },
];

async function askCount(message, options, initialValue) {
    const choice = await p.select({ message, options, initialValue });
    if (p.isCancel(choice)) return null;
    if (choice === 'custom') {
        const custom = await text({
            message: 'Vlastný počet:',
            validate: (v) => {
                const n = parseInt(v, 10);
                if (!Number.isInteger(n) || n < 1) return 'Zadaj kladné celé číslo';
            },
        });
        if (p.isCancel(custom)) return null;
        return parseInt(custom, 10);
    }
    return choice;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runInitSeed() {
    // 1. Choose eshop type
    const typeKey = await p.select({
        message: 'Typ e-shopu:',
        options: Object.entries(ESHOP_TYPES).map(([value, t]) => ({ value, label: t.label })),
    });
    if (p.isCancel(typeKey)) return;

    const typeData = ESHOP_TYPES[typeKey];

    // 2. Select what to seed
    const selected = await p.multiselect({
        message: 'Vyber čo sa má seedovať (medzerník = prepnutie):',
        options: [
            { value: 'manufacturers', label: 'Výrobcovia (manufacturers)' },
            { value: 'properties',    label: 'Vlastnosti / typy produktov (properties)' },
            { value: 'categories',    label: 'Kategórie (requires: properties)' },
            { value: 'products',      label: 'Produkty (requires: categories, manufacturers, properties)' },
            { value: 'branches',      label: 'Pobočky (branches)' },
            { value: 'benefits',      label: 'Benefity (benefits)' },
            { value: 'sections',      label: 'Sekcie (sections)' },
            { value: 'articles',      label: 'Články (requires: sections)' },
            { value: 'faqSections',   label: 'Sekcie FAQ (faq-sections)' },
            { value: 'faqs',          label: 'FAQ otázky (requires: faq-sections)' },
            { value: 'testimonials',  label: 'Referencie (testimonials)' },
        ],
        initialValues: ['manufacturers', 'properties', 'categories', 'products', 'branches', 'benefits', 'sections', 'articles', 'faqSections', 'faqs', 'testimonials'],
    });
    if (p.isCancel(selected)) return;

    // 3. Validate & auto-fix dependencies
    const deps = {
        categories:  ['properties'],
        products:    ['categories', 'manufacturers', 'properties'],
        articles:    ['sections'],
        faqs:        ['faqSections'],
    };

    for (const [item, required] of Object.entries(deps)) {
        if (selected.includes(item)) {
            const missing = required.filter((r) => !selected.includes(r));
            if (missing.length > 0) {
                for (const m of missing) selected.push(m);
                p.log.warn(`Automaticky pridané [${missing.join(', ')}] — vyžadované pre '${item}'`);
            }
        }
    }

    const opts = {
        manufacturers: selected.includes('manufacturers'),
        properties:    selected.includes('properties'),
        categories:    selected.includes('categories'),
        products:      selected.includes('products'),
        branches:      selected.includes('branches'),
        benefits:      selected.includes('benefits'),
        sections:      selected.includes('sections'),
        articles:      selected.includes('articles'),
        faqSections:   selected.includes('faqSections'),
        faqs:          selected.includes('faqs'),
        testimonials:  selected.includes('testimonials'),
    };

    // 4. Ask counts for each selected option (except properties)
    const counts = {
        manufacturers: 12,
        categories: 12,
        subCategoriesMax: 12,
        products: 128,
        branches: 12,
        benefits: 12,
        sections: 12,
        articles: 12,
        faqSections: 12,
        faqs: 12,
        testimonials: 12,
    };

    if (opts.manufacturers) {
        const v = await askCount('Počet výrobcov:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.manufacturers = v;
    }

    if (opts.categories) {
        const v = await askCount('Počet kategórií:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.categories = v;

        const sub = await askCount('Max. počet podkategórií na kategóriu (rozsah 0–x):', STANDARD_COUNT_OPTIONS, 12);
        if (sub === null) return;
        counts.subCategoriesMax = sub;
    }

    if (opts.products) {
        const v = await askCount('Počet produktov:', PRODUCT_COUNT_OPTIONS, 128);
        if (v === null) return;
        counts.products = v;
    }

    if (opts.branches) {
        const v = await askCount('Počet pobočiek:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.branches = v;
    }

    if (opts.benefits) {
        const v = await askCount('Počet benefitov:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.benefits = v;
    }

    if (opts.sections) {
        const v = await askCount('Počet sekcií:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.sections = v;
    }

    if (opts.articles) {
        const v = await askCount('Počet článkov (okrem právnych):', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.articles = v;
    }

    if (opts.faqSections) {
        const v = await askCount('Počet FAQ sekcií:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.faqSections = v;
    }

    if (opts.faqs) {
        const v = await askCount('Počet FAQ otázok:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.faqs = v;
    }

    if (opts.testimonials) {
        const v = await askCount('Počet referencií:', STANDARD_COUNT_OPTIONS, 12);
        if (v === null) return;
        counts.testimonials = v;
    }

    // 5. Check if file exists
    const filePath = join(rootDir, SEED_FILE);
    let fileExists = false;
    try {
        await access(filePath);
        fileExists = true;
    } catch {
        fileExists = false;
    }

    if (fileExists) {
        const overwrite = await p.confirm({
            message: `${SEED_FILE} už existuje. Prepísať?`,
            initialValue: false,
        });
        if (p.isCancel(overwrite) || !overwrite) return;
    }

    // 7. Generate & write file
    const content = generatePhpContent(typeData, opts, counts);
    await writeFile(filePath, content, 'utf8');
    p.log.success(pc.cyan(`${SEED_FILE} vytvorený ✨`));

    // 8. Ask to run
    const run = await p.confirm({
        message: `Spustiť bin/cake BasicSeed.basic_seed --file seed_init.php?`,
        initialValue: false,
    });
    if (p.isCancel(run) || !run) return;

    const spinner = p.spinner();
    spinner.start('Spúšťam seed...');
    try {
        const result = await execa('bin/cake', ['BasicSeed.basic_seed', '--file', 'seed_init.php'], {
            cwd: rootDir,
            all: true,
        });
        spinner.stop(pc.cyan('Seed úspešne dokončený ✨'));
        if (result.all) p.log.info(result.all);
    } catch (err) {
        spinner.stop(pc.red('Seed zlyhal'));
        p.log.error(err.all || err.stderr || err.message);
        return;
    }

    await runPostSeedSteps();
}

export async function runPostSeedSteps() {
    // repairData
    const repair = await p.confirm({
        message: `Spustiť bin/cake rshop cron repairData?`,
        initialValue: true,
    });
    if (!p.isCancel(repair) && repair) {
        const spinner2 = p.spinner();
        spinner2.start('Spúšťam repairData...');
        try {
            const result = await execa('bin/cake', ['rshop', 'cron', 'repairData'], {
                cwd: rootDir,
                all: true,
            });
            spinner2.stop(pc.cyan('repairData dokončený ✨'));
            if (result.all) p.log.info(result.all);
        } catch (err) {
            spinner2.stop(pc.red('repairData zlyhal'));
            p.log.error(err.all || err.stderr || err.message);
        }
    }

    // reindex (only if search.elastic is configured)
    let searchConfigured = false;
    try {
        const db = await getDbConfig();
        const { stdout } = await execa('mysql', mysqlArgs(db,
            `SELECT value FROM rshop_configurations WHERE configuration_key = 'search.elastic' LIMIT 1`
        ));
        searchConfigured = stdout.trim().length > 0 && stdout.trim() !== 'NULL';
    } catch { /* DB not accessible — skip reindex */ }

    if (searchConfigured) {
        const reindex = await p.confirm({
            message: `Spustiť bin/cake rshop:reindex?`,
            initialValue: true,
        });
        if (!p.isCancel(reindex) && reindex) {
            const spinner3 = p.spinner();
            spinner3.start('Spúšťam reindex...');
            try {
                const result = await execa('bin/cake', ['rshop:reindex'], {
                    cwd: rootDir,
                    all: true,
                });
                spinner3.stop(pc.cyan('Reindex dokončený ✨'));
                if (result.all) p.log.info(result.all);
            } catch (err) {
                spinner3.stop(pc.red('Reindex zlyhal'));
                p.log.error(err.all || err.stderr || err.message);
            }
        }
    } else {
        p.log.info(pc.dim('Reindex preskočený — search.elastic nie je nakonfigurovaný.'));
    }
}
