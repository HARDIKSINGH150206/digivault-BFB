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
