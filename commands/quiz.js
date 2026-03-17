import * as p from '@clack/prompts';
import pc from 'picocolors';

const QUESTIONS = [
    {
        q: "What is Taylor Swift's full birth date?",
        a: ["December 13, 1989", "October 24, 1989", "March 13, 1990", "December 13, 1990", "September 25, 1989", "June 13, 1989", "February 20, 1990"]
    },
    {
        q: "In which city was Taylor Swift born?",
        a: ["West Reading, Pennsylvania", "Nashville, Tennessee", "New York City, New York", "Hendersonville, Tennessee", "Austin, Texas", "Los Angeles, California", "Atlanta, Georgia"]
    },
    {
        q: "What was Taylor Swift's debut single, released in June 2006?",
        a: ["Tim McGraw", "Love Story", "Our Song", "Teardrops on My Guitar", "Picture to Burn", "Should've Said No", "Mean"]
    },
    {
        q: "Which record label did Taylor Swift sign with at age 14?",
        a: ["Big Machine Records", "Republic Records", "Columbia Records", "Interscope Records", "Sony Music", "Atlantic Records", "RCA Records"]
    },
    {
        q: "What is the name of Taylor Swift's debut studio album, released in October 2006?",
        a: ["Taylor Swift", "Fearless", "Speak Now", "Beautiful Eyes", "Debut", "Gold", "Enchanted"]
    },
    {
        q: "Which album did Taylor Swift release in 2008 that won her the Grammy for Album of the Year?",
        a: ["Fearless", "Speak Now", "Red", "Taylor Swift", "1989", "Lover", "Folklore"]
    },
    {
        q: "How old was Taylor Swift when she won her first Grammy for Album of the Year in 2010, making her the youngest winner at the time?",
        a: ["20", "18", "22", "19", "17", "21", "23"]
    },
    {
        q: "'Speak Now' (2010) holds which unique distinction among Taylor Swift's albums?",
        a: ["Every song was written solely by Taylor Swift, with no co-writers", "It was her first album to debut at number one", "It featured the most collaborations of any of her albums", "It was her first album released on Republic Records", "It was her longest album by track count", "It was the first album recorded in Los Angeles", "It was the first album to go platinum in 24 hours"]
    },
    {
        q: "Which album marked Taylor Swift's official transition from country to pop music in 2014?",
        a: ["1989", "Red", "Reputation", "Lover", "Fearless", "Speak Now", "Midnights"]
    },
    {
        q: "What does the title of Taylor Swift's album '1989' refer to?",
        a: ["The year she was born", "The year her parents were married", "The year Big Machine Records was founded", "Her favorite era of music history", "The year she moved to Nashville", "The year she started writing songs", "The year her debut album went platinum"]
    },
    {
        q: "On which album is the song 'Love Story'?",
        a: ["Fearless", "Taylor Swift", "Speak Now", "Red", "Lover", "Reputation", "Midnights"]
    },
    {
        q: "On which album is 'Shake It Off'?",
        a: ["1989", "Red", "Reputation", "Lover", "Fearless", "Speak Now", "Midnights"]
    },
    {
        q: "On which album is 'Blank Space'?",
        a: ["1989", "Fearless", "Red", "Reputation", "Lover", "Speak Now", "Folklore"]
    },
    {
        q: "Which Taylor Swift song was her first number-one hit on the Billboard Hot 100?",
        a: ["We Are Never Ever Getting Back Together", "Shake It Off", "Love Story", "Blank Space", "You Belong With Me", "Teardrops on My Guitar", "Our Song"]
    },
    {
        q: "Taylor Swift's 'Anti-Hero' from Midnights spent how many weeks at number one on the Billboard Hot 100?",
        a: ["8", "4", "10", "6", "12", "3", "5"]
    },
    {
        q: "Which Taylor Swift song became the longest song ever to top the Billboard Hot 100 when released in 2021?",
        a: ["All Too Well (10 Minute Version)", "The Lakes", "Tolerate It", "Long Live", "All Too Well", "Cardigan", "The Tortured Poets Department"]
    },
    {
        q: "On which album is 'Cruel Summer', which hit number one on the Hot 100 in 2023 — four years after the album's release?",
        a: ["Lover", "1989", "Reputation", "Folklore", "Midnights", "Red", "Evermore"]
    },
    {
        q: "How many total Grammy Awards has Taylor Swift won?",
        a: ["14", "10", "12", "17", "8", "16", "20"]
    },
    {
        q: "Which Grammy record does Taylor Swift hold that no other artist in history shares?",
        a: ["Most Album of the Year wins (4)", "Most Grammy nominations by a female artist", "Most wins in a single Grammy ceremony", "Most consecutive years winning a Grammy", "Most nominations in a single year", "Youngest artist to win Song of the Year", "First to win all four general field Grammys"]
    },
    {
        q: "For which album did Taylor Swift win her fourth Grammy for Album of the Year in 2024?",
        a: ["Midnights", "The Tortured Poets Department", "Evermore", "Folklore", "Lover", "Reputation", "1989"]
    },
    {
        q: "What was the total gross revenue of Taylor Swift's Eras Tour, making it the highest-grossing concert tour in history?",
        a: ["Over $2 billion", "Over $1 billion", "Around $1.5 billion", "Around $900 million", "Over $3 billion", "Over $500 million", "Around $750 million"]
    },
    {
        q: "Taylor Swift's Eras Tour began in which year?",
        a: ["2023", "2022", "2024", "2021", "2020", "2025", "2019"]
    },
    {
        q: "In what month and year was 'Folklore' surprise-released?",
        a: ["July 2020", "October 2020", "March 2020", "December 2020", "May 2020", "February 2020", "November 2020"]
    },
    {
        q: "What are the names of Taylor Swift's three cats?",
        a: ["Meredith Grey, Olivia Benson, and Benjamin Button", "Meredith Grey, Olivia Benson, and Marjorie", "Meredith Grey, Luna, and Benjamin Button", "Olivia Benson, Dobby, and Benjamin Button", "Meredith Grey, Luna, and Dobby", "Olivia Benson, Benjamin Button, and Luna", "Meredith Grey, Pebbles, and Benjamin Button"]
    },
    {
        q: "Taylor Swift's cat Meredith Grey is named after the main character from which TV show?",
        a: ["Grey's Anatomy", "Law & Order: SVU", "Desperate Housewives", "Scrubs", "Private Practice", "Station 19", "ER"]
    },
    {
        q: "Taylor Swift's cat Olivia Benson is named after a character from which TV show?",
        a: ["Law & Order: SVU", "Grey's Anatomy", "Orange Is the New Black", "The Good Wife", "Desperate Housewives", "The Crown", "Friends"]
    },
    {
        q: "On which music video set did Taylor Swift adopt her cat Benjamin Button?",
        a: ["ME!", "Look What You Made Me Do", "Shake It Off", "Blank Space", "Anti-Hero", "Lover", "Cardigan"]
    },
    {
        q: "Where did Taylor Swift grow up before moving to Tennessee at age 14?",
        a: ["Wyomissing, Pennsylvania", "West Reading, Pennsylvania", "Reading, Pennsylvania", "Philadelphia, Pennsylvania", "Lancaster, Pennsylvania", "Harrisburg, Pennsylvania", "Pittsburgh, Pennsylvania"]
    },
    {
        q: "What did Taylor Swift's family grow on their farm in Pennsylvania?",
        a: ["Christmas trees", "Horses", "Dairy cows", "Grapes", "Sunflowers", "Apple trees", "Wheat"]
    },
    {
        q: "Taylor Swift received an honorary Doctor of Fine Arts degree from which university in May 2022?",
        a: ["New York University (NYU)", "Harvard University", "Vanderbilt University", "University of Pennsylvania", "Columbia University", "Yale University", "Berklee College of Music"]
    },
    {
        q: "Taylor Swift was named Time magazine's Person of the Year in which year?",
        a: ["2023", "2022", "2021", "2024", "2020", "2019", "2018"]
    },
    {
        q: "Which rapper collaborated with Taylor Swift on the 2015 version of 'Bad Blood'?",
        a: ["Kendrick Lamar", "Drake", "Jay-Z", "Kanye West", "Nicki Minaj", "Cardi B", "Travis Scott"]
    },
    {
        q: "Taylor Swift's 'Reputation' album was released in which year?",
        a: ["2017", "2016", "2018", "2015", "2014", "2019", "2020"]
    },
    {
        q: "Which imagery became a central theme of Taylor Swift's Reputation era?",
        a: ["Snakes", "Butterflies", "Spiders", "Ravens", "Black cats", "Lightning bolts", "Roses"]
    },
    {
        q: "At the 2009 MTV VMAs, Kanye West interrupted Taylor Swift's acceptance speech for which award?",
        a: ["Best Female Video", "Video of the Year", "Best Pop Video", "Best New Artist", "Artist of the Year", "Best Direction", "Best Choreography"]
    },
    {
        q: "Which song was Taylor Swift accepting the award for when Kanye West interrupted her at the 2009 VMAs?",
        a: ["You Belong With Me", "Love Story", "Fearless", "White Horse", "Fifteen", "Change", "Our Song"]
    },
    {
        q: "For approximately how long did Taylor Swift and actor Joe Alwyn date before their breakup in 2023?",
        a: ["Six years", "Two years", "Four years", "Eight years", "Three years", "One year", "Five years"]
    },
    {
        q: "Taylor Swift started publicly dating NFL player Travis Kelce in which year?",
        a: ["2023", "2022", "2024", "2021", "2020", "2019", "2025"]
    },
    {
        q: "Taylor Swift was the most-streamed artist on Spotify in which consecutive years?",
        a: ["2023 and 2024", "2022 and 2023", "2021 and 2022", "2020 and 2021", "2019 and 2020", "2018 and 2019", "2024 and 2025"]
    },
    {
        q: "What is Taylor Swift's most-streamed song on Spotify?",
        a: ["Cruel Summer", "Anti-Hero", "Shake It Off", "Blank Space", "Love Story", "Style", "Lover"]
    },
    {
        q: "What historic feat did Taylor Swift's 'Midnights' achieve on the Billboard Hot 100 upon its release?",
        a: ["Occupying the entire top 10 simultaneously", "Debuting at number one for the longest in her career", "Earning the most digital downloads in a single week", "All tracks certified platinum on release day", "All tracks topped the chart simultaneously", "Fastest album to reach 1 billion streams", "Biggest first-week album sales ever"]
    },
    {
        q: "Which of Taylor Swift's albums was written entirely by her alone, with no co-writers on any track?",
        a: ["Speak Now", "Fearless", "Taylor Swift", "Red", "1989", "Lover", "Folklore"]
    },
    {
        q: "Taylor Swift's mother Andrea was first diagnosed with which illness in 2015?",
        a: ["Breast cancer", "Ovarian cancer", "Lung cancer", "Leukemia", "Multiple sclerosis", "Parkinson's disease", "Lymphoma"]
    },
    {
        q: "Which Taylor Swift album features the songs 'cardigan', 'exile', and 'august'?",
        a: ["Folklore", "Evermore", "Lover", "Midnights", "Red", "1989", "Speak Now"]
    },
    {
        q: "Taylor Swift co-wrote 'Everything Has Changed' with which artist on her Red album?",
        a: ["Ed Sheeran", "Gary Lightbody", "Brendon Urie", "Colbie Caillat", "Shawn Mendes", "Khalid", "Justin Bieber"]
    },
    {
        q: "On which album is the song 'Style'?",
        a: ["1989", "Red", "Reputation", "Lover", "Folklore", "Fearless", "Midnights"]
    },
    {
        q: "On which album is the song 'Delicate'?",
        a: ["Reputation", "1989", "Lover", "Red", "Folklore", "Fearless", "Midnights"]
    },
    {
        q: "Taylor Swift's 'Lover' album was released in which year?",
        a: ["2019", "2018", "2020", "2017", "2021", "2016", "2022"]
    },
    {
        q: "Which Taylor Swift song features the lyric 'I had the time of my life fighting dragons with you'?",
        a: ["Long Live", "Fearless", "The Best Day", "Change", "Mine", "Fifteen", "The Story of Us"]
    },
    {
        q: "Taylor Swift collaborated with which band's lead singer Brendon Urie on the song 'ME!'?",
        a: ["Panic! at the Disco", "Fall Out Boy", "Twenty One Pilots", "My Chemical Romance", "Paramore", "The 1975", "Imagine Dragons"]
    },
    {
        q: "On which album is the song 'All Too Well'?",
        a: ["Red", "Speak Now", "1989", "Fearless", "Lover", "Folklore", "Reputation"]
    },
];

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function pickRandom(arr, n) {
    return shuffle(arr).slice(0, n);
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export async function runQuiz() {
    p.log.step(pc.bold('🎸 Taylor Swift Quiz — 3 random questions!'));

    const questions = pickRandom(QUESTIONS, 3);
    let score = 0;

    for (let i = 0; i < questions.length; i++) {
        const { q, a } = questions[i];
        const [correct, ...wrong] = a;
        const shuffledAnswers = shuffle([correct, ...wrong]);
        const correctLabel = LABELS[shuffledAnswers.indexOf(correct)];

        const answer = await p.select({
            message: `Q${i + 1}: ${q}`,
            options: shuffledAnswers.map((text, idx) => ({
                value: text,
                label: `${LABELS[idx]}. ${text}`,
            })),
        });
        if (p.isCancel(answer)) {
            p.cancel('Quiz cancelled.');
            process.exit(0);
        }

        if (answer === correct) {
            score++;
            p.log.success(`Correct! ✓`);
        } else {
            p.log.error(`Wrong! The correct answer was: ${correctLabel}. ${correct}`);
        }
    }

    const messages = {
        0: pc.red("0/3 — Maybe stick to coding? 😬"),
        1: pc.yellow("1/3 — Are you even a fan? 🤔"),
        2: pc.cyan("2/3 — Pretty good Swiftie! 🌟"),
        3: pc.green("3/3 — You're a certified Swiftie! 🎉"),
    };

    p.note(messages[score], 'Quiz result');
}
