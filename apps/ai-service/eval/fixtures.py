"""
Fictional people, places and FIR wording for the redaction recall test set
(docs/07 Phase 6). Nothing here is a real person or record.

Each language has several label variants for the same field, as real FIR
formats differ between states and stations. The engine is measured on all
of them, not only on the wording its patterns were written for.
"""

NAMES = {
    "en": {
        "female": ["Kavya Reddy", "Sunita Devi", "Pooja Malhotra", "Ananya Iyer", "Rekha Kumari",
                   "Meenakshi Pillai", "Farah Khan", "Lakshmi Narayan", "Neha Bansal", "Shalini Gowda"],
        "male": ["Ravi Shankar", "Mohammed Salim", "Vikram Choudhary", "Arjun Mehta", "Suresh Yadav",
                 "Deepak Joshi", "Imran Qureshi", "Manoj Tiwari", "Prakash Hegde", "Rahul Saxena"],
    },
    "hi": {
        "female": ["सुनीता देवी", "पूजा शर्मा", "रेखा कुमारी", "अंजलि वर्मा", "कविता सिंह",
                   "नेहा गुप्ता", "प्रिया यादव", "मीना कुमारी", "सीमा तिवारी", "रुबीना खान"],
        "male": ["रमेश कुमार", "सुरेश यादव", "विकास चौहान", "मनोज तिवारी", "अजय मिश्रा",
                 "राजेश पांडे", "इमरान अली", "दीपक जोशी", "संजय गुप्ता", "राहुल वर्मा"],
    },
    "kn": {
        "female": ["ಕಾವ್ಯ ರೆಡ್ಡಿ", "ಲಕ್ಷ್ಮಿ ದೇವಿ", "ಸುಮಾ ಗೌಡ", "ಅನಿತಾ ಶೆಟ್ಟಿ", "ರೇಖಾ ನಾಯಕ್",
                   "ಪ್ರಿಯಾ ಹೆಗಡೆ", "ಶಾಲಿನಿ ರಾವ್", "ಮೀನಾ ಕುಮಾರಿ", "ಸವಿತಾ ಪಾಟೀಲ್", "ದೀಪಾ ಭಟ್"],
        "male": ["ರವಿ ಕುಮಾರ್", "ಸುರೇಶ್ ಗೌಡ", "ಮಂಜುನಾಥ ಶೆಟ್ಟಿ", "ಪ್ರಕಾಶ್ ಹೆಗಡೆ", "ನಾಗರಾಜ ರಾವ್",
                 "ವಿಜಯ್ ಪಾಟೀಲ್", "ಮಹೇಶ್ ನಾಯಕ್", "ಇಮ್ರಾನ್ ಖಾನ್", "ರಾಜು ಭಟ್", "ಗಿರೀಶ್ ಕಾಮತ್"],
    },
}

# (house, street/area, city, PIN). Addresses are rendered as one line.
ADDRESSES = {
    "en": [("H.No. 14", "MG Road, Indiranagar", "Bengaluru", "560038"),
           ("Flat 302", "Laxmi Nagar", "Delhi", "110092"),
           ("12/4", "Gandhi Chowk, Civil Lines", "Lucknow", "226001"),
           ("Plot 77", "Shivaji Nagar", "Pune", "411005"),
           ("H.No. 9", "Ward 6, Station Road", "Hubballi", "580020")],
    "hi": [("मकान नं. 14", "गांधी नगर", "लखनऊ", "226001"),
           ("मकान नं. 7", "शास्त्री नगर", "कानपुर", "208005"),
           ("ग्राम रामपुर", "तहसील सदर", "बाराबंकी", "225001"),
           ("मकान नं. 32", "सिविल लाइन्स", "प्रयागराज", "211001"),
           ("वार्ड नं. 5", "स्टेशन रोड", "आगरा", "282001")],
    "kn": [("ಮನೆ ನಂ. 14", "ಗಾಂಧಿ ನಗರ", "ಬೆಂಗಳೂರು", "560009"),
           ("ಮನೆ ನಂ. 7", "ವಿದ್ಯಾನಗರ", "ಹುಬ್ಬಳ್ಳಿ", "580021"),
           ("ಗ್ರಾಮ ಹೊಸಹಳ್ಳಿ", "ತಾಲ್ಲೂಕು ಮಂಡ್ಯ", "ಮಂಡ್ಯ", "571401"),
           ("ಮನೆ ನಂ. 32", "ಸರಸ್ವತಿಪುರಂ", "ಮೈಸೂರು", "570009"),
           ("ವಾರ್ಡ್ ನಂ. 5", "ಸ್ಟೇಷನ್ ರಸ್ತೆ", "ಬೆಳಗಾವಿ", "590001")],
}

STATIONS = {
    "en": ["Indiranagar", "Laxmi Nagar", "Hazratganj", "Shivaji Nagar", "Vidyanagar"],
    "hi": ["हजरतगंज", "कोतवाली", "गांधी नगर", "सिविल लाइन्स", "सदर बाजार"],
    "kn": ["ಇಂದಿರಾನಗರ", "ವಿದ್ಯಾನಗರ", "ಸರಸ್ವತಿಪುರಂ", "ಮಂಡ್ಯ ಗ್ರಾಮಾಂತರ", "ಬೆಳಗಾವಿ ನಗರ"],
}

TITLE = {
    "en": "FIRST INFORMATION REPORT",
    "hi": "प्रथम सूचना रिपोर्ट",
    "kn": "ಪ್ರಥಮ ಮಾಹಿತಿ ವರದಿ",
}

# Field labels: one variant is chosen per document.
LABELS = {
    "en": {
        "fir": ["FIR No.", "FIR No"],
        "date": ["Date:", "Date of report:"],
        "station": ["Police Station:", "P.S.:"],
        "complainant": ["Complainant:", "Name of complainant:", "Victim:", "Informant:"],
        "relative": ["D/o", "W/o", "Father's name:", "Husband's name:"],
        "age": ["Age:", "Aged"],
        "phone": ["Mobile:", "Phone No.:", "Contact:", "Mob."],
        "aadhaar": ["Aadhaar No.:", "Aadhaar:", "UID:"],
        "address": ["Address:", "R/o", "Residing at"],
        "accused": ["Accused:", "Name of accused:", "Suspect:"],
        "witness": ["Witness:", "Name of witness:"],
    },
    "hi": {
        "fir": ["प्र.सू.रि. सं."],
        "date": ["दिनांक:"],
        "station": ["थाना:"],
        "complainant": ["शिकायतकर्ता:", "शिकायतकर्ता का नाम:", "पीड़िता:", "सूचनाकर्ता:"],
        "relative": ["पुत्री", "पत्नी", "पिता का नाम:"],
        "age": ["आयु:", "उम्र:"],
        "phone": ["मोबाइल:", "मोबाइल नंबर:", "फोन:", "संपर्क:"],
        "aadhaar": ["आधार संख्या:", "आधार:", "आधार नं.:"],
        "address": ["पता:", "निवास:", "निवासी"],
        "accused": ["आरोपी:", "आरोपी का नाम:", "अभियुक्त:"],
        "witness": ["गवाह:", "साक्षी:"],
    },
    "kn": {
        "fir": ["ಪ್ರಕರಣ ಸಂಖ್ಯೆ:"],
        "date": ["ದಿನಾಂಕ:"],
        "station": ["ಠಾಣೆ:"],
        "complainant": ["ದೂರುದಾರರು:", "ದೂರುದಾರರ ಹೆಸರು:", "ಸಂತ್ರಸ್ತೆ:"],
        "relative": ["ತಂದೆ:", "ಪತಿ:", "ತಂದೆಯ ಹೆಸರು:"],
        "age": ["ವಯಸ್ಸು:"],
        "phone": ["ಮೊಬೈಲ್:", "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ:", "ದೂರವಾಣಿ:"],
        "aadhaar": ["ಆಧಾರ್ ಸಂಖ್ಯೆ:", "ಆಧಾರ್:"],
        "address": ["ವಿಳಾಸ:", "ವಾಸ:"],
        "accused": ["ಆರೋಪಿ:", "ಆರೋಪಿಯ ಹೆಸರು:"],
        "witness": ["ಸಾಕ್ಷಿ:"],
    },
}

# Narrative sentences. {victim}, {accused}, {phone}, {place}, {date} are filled
# in; the victim's name appears again without any label, as in real FIRs.
NARRATIVE = {
    "en": [
        "On {date} the complainant {victim} stated that {accused} followed her",
        "from the bus stop near {place} for several days.",
        "She said {accused} called her repeatedly from {phone} at night.",
        "{victim} requested police protection and legal action.",
    ],
    "hi": [
        "दिनांक {date} को पीड़िता {victim} ने बताया कि आरोपी {accused}",
        "कई दिनों से {place} के बस स्टॉप से उसका पीछा कर रहा था।",
        "आरोपी ने रात में {phone} से बार बार फोन किया।",
        "{victim} ने पुलिस सुरक्षा और कार्रवाई की मांग की।",
    ],
    "kn": [
        "{date} ರಂದು ದೂರುದಾರರಾದ {victim} ಅವರು ಆರೋಪಿ {accused}",
        "{place} ಬಸ್ ನಿಲ್ದಾಣದಿಂದ ಹಲವು ದಿನ ಹಿಂಬಾಲಿಸಿದ್ದಾಗಿ ತಿಳಿಸಿದರು.",
        "ಆರೋಪಿ ರಾತ್ರಿ {phone} ಸಂಖ್ಯೆಯಿಂದ ಪದೇ ಪದೇ ಕರೆ ಮಾಡಿದ್ದಾನೆ.",
        "{victim} ಅವರು ಪೊಲೀಸ್ ರಕ್ಷಣೆ ಮತ್ತು ಕ್ರಮಕ್ಕೆ ಮನವಿ ಮಾಡಿದ್ದಾರೆ.",
    ],
}

FOOTER = "Synthetic test record for DigiVault redaction measurement - all details are fictional"

# Follow-up statement in the same case: the same people, never with a role
# label in front of them. Only the case gazetteer can know they are names.
FOLLOWUP = {
    "en": [
        "Statement recorded on {date}.",
        "{victim} came to the station again with {witness}.",
        "She identified {accused} from photographs.",
        "{accused} was not found at his residence.",
    ],
    "hi": [
        "दिनांक {date} को बयान दर्ज किया गया।",
        "{victim} अपने परिचित {witness} के साथ थाने आईं।",
        "उन्होंने फोटो से {accused} की पहचान की।",
        "{accused} अपने घर पर नहीं मिला।",
    ],
    "kn": [
        "{date} ರಂದು ಹೇಳಿಕೆ ದಾಖಲಿಸಲಾಗಿದೆ.",
        "{victim} ಅವರು {witness} ಜೊತೆ ಬಂದರು.",
        "ಅವರು ಫೋಟೋದಿಂದ {accused} ಅವರನ್ನು ಗುರುತಿಸಿದರು.",
        "{accused} ಮನೆಯಲ್ಲಿ ಸಿಗಲಿಲ್ಲ.",
    ],
}

# The same person written in Latin, Devanagari and Kannada, spelled the way
# each is commonly written (गौड़ा, हेगड़े), not the way that suits the
# normaliser. None = not commonly written in that script. Used to measure
# how often the gazetteer key agrees across scripts (docs/08).
PARALLEL_NAMES = [
    ("Kavita Singh", "कविता सिंह", "ಕವಿತಾ ಸಿಂಗ್"),
    ("Sunita Devi", "सुनीता देवी", "ಸುನೀತಾ ದೇವಿ"),
    ("Pooja Sharma", "पूजा शर्मा", "ಪೂಜಾ ಶರ್ಮಾ"),
    ("Anjali Verma", "अंजलि वर्मा", "ಅಂಜಲಿ ವರ್ಮಾ"),
    ("Rekha Kumari", "रेखा कुमारी", "ರೇಖಾ ಕುಮಾರಿ"),
    ("Meena Kumari", "मीना कुमारी", "ಮೀನಾ ಕುಮಾರಿ"),
    ("Priya Yadav", "प्रिया यादव", "ಪ್ರಿಯಾ ಯಾದವ್"),
    ("Neha Gupta", "नेहा गुप्ता", "ನೇಹಾ ಗುಪ್ತಾ"),
    ("Seema Tiwari", "सीमा तिवारी", "ಸೀಮಾ ತಿವಾರಿ"),
    ("Rubina Khan", "रुबीना खान", "ರುಬೀನಾ ಖಾನ್"),
    ("Lakshmi Devi", "लक्ष्मी देवी", "ಲಕ್ಷ್ಮಿ ದೇವಿ"),
    ("Kavya Reddy", "काव्या रेड्डी", "ಕಾವ್ಯ ರೆಡ್ಡಿ"),
    ("Suma Gowda", "सुमा गौड़ा", "ಸುಮಾ ಗೌಡ"),
    ("Anitha Shetty", "अनीता शेट्टी", "ಅನಿತಾ ಶೆಟ್ಟಿ"),
    ("Ramesh Kumar", "रमेश कुमार", "ರಮೇಶ್ ಕುಮಾರ್"),
    ("Suresh Yadav", "सुरेश यादव", "ಸುರೇಶ್ ಯಾದವ್"),
    ("Vikas Chauhan", "विकास चौहान", "ವಿಕಾಸ್ ಚೌಹಾಣ್"),
    ("Manoj Tiwari", "मनोज तिवारी", "ಮನೋಜ್ ತಿವಾರಿ"),
    ("Ajay Mishra", "अजय मिश्रा", "ಅಜಯ್ ಮಿಶ್ರಾ"),
    ("Rajesh Pandey", "राजेश पांडे", "ರಾಜೇಶ್ ಪಾಂಡೆ"),
    ("Imran Ali", "इमरान अली", "ಇಮ್ರಾನ್ ಅಲಿ"),
    ("Deepak Joshi", "दीपक जोशी", "ದೀಪಕ್ ಜೋಶಿ"),
    ("Sanjay Gupta", "संजय गुप्ता", "ಸಂಜಯ್ ಗುಪ್ತಾ"),
    ("Rahul Verma", "राहुल वर्मा", "ರಾಹುಲ್ ವರ್ಮಾ"),
    ("Mohammed Salim", "मोहम्मद सलीम", "ಮೊಹಮ್ಮದ್ ಸಲೀಂ"),
    ("Prakash Hegde", "प्रकाश हेगड़े", "ಪ್ರಕಾಶ್ ಹೆಗಡೆ"),
    ("Farah Khan", "फराह खान", "ಫರಾ ಖಾನ್"),
    ("Shalini Rao", "शालिनी राव", "ಶಾಲಿನಿ ರಾವ್"),
]

# Held-out list: written after the normalisation rules were final and
# measured once; not used to change them.
PARALLEL_NAMES_HOLDOUT = [
    ("Geeta Patel", "गीता पटेल", "ಗೀತಾ ಪಟೇಲ್"),
    ("Asha Rani", "आशा रानी", "ಆಶಾ ರಾಣಿ"),
    ("Nisha Agarwal", "निशा अग्रवाल", "ನಿಶಾ ಅಗರ್ವಾಲ್"),
    ("Sarita Mehta", "सरिता मेहता", "ಸರಿತಾ ಮೆಹ್ತಾ"),
    ("Divya Nair", "दिव्या नायर", "ದಿವ್ಯಾ ನಾಯರ್"),
    ("Shabana Begum", "शबाना बेगम", "ಶಬಾನಾ ಬೇಗಂ"),
    ("Usha Pillai", "उषा पिल्लै", "ಉಷಾ ಪಿಳ್ಳೈ"),
    ("Radha Krishnan", "राधा कृष्णन", "ರಾಧಾ ಕೃಷ್ಣನ್"),
    ("Jyoti Kumari", "ज्योति कुमारी", "ಜ್ಯೋತಿ ಕುಮಾರಿ"),
    ("Bhavana Rao", "भावना राव", "ಭಾವನಾ ರಾವ್"),
    ("Arun Kumar", "अरुण कुमार", "ಅರುಣ್ ಕುಮಾರ್"),
    ("Naveen Shetty", "नवीन शेट्टी", "ನವೀನ್ ಶೆಟ್ಟಿ"),
    ("Sunil Dubey", "सुनील दुबे", "ಸುನೀಲ್ ದುಬೆ"),
    ("Ravi Teja", "रवि तेजा", "ರವಿ ತೇಜ"),
    ("Abdul Rahman", "अब्दुल रहमान", "ಅಬ್ದುಲ್ ರೆಹಮಾನ್"),
    ("Harish Bhat", "हरीश भट", "ಹರೀಶ್ ಭಟ್"),
    ("Gopal Krishna", "गोपाल कृष्ण", "ಗೋಪಾಲ ಕೃಷ್ಣ"),
    ("Kiran Kulkarni", "किरण कुलकर्णी", "ಕಿರಣ್ ಕುಲಕರ್ಣಿ"),
    ("Venkatesh Murthy", "वेंकटेश मूर्ति", "ವೆಂಕಟೇಶ್ ಮೂರ್ತಿ"),
    ("Santosh Patil", "संतोष पाटिल", "ಸಂತೋಷ್ ಪಾಟೀಲ್"),
]
