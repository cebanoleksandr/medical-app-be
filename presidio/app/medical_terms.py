"""Medical vocabulary the small spaCy models mistake for names or places
("Bisoprolol 2.5" → PERSON, "Pulmonology" → LOCATION).

Terms are lowercase and matched as prefixes of tokens, so a stem such as
"метформін" also covers the inflected "метформіну"; keep stems ≥ 5 letters
to avoid swallowing real surnames.
"""

_EN = """
acetaminophen acetylsalicylic albuterol allopurinol alprazolam amiodarone amitriptyline
amlodipine amoxicillin ampicillin apixaban aspirin atenolol atorvastatin azithromycin
baclofen benazepril bisoprolol budesonide bumetanide buprenorphine bupropion buspirone
candesartan captopril carbamazepine carvedilol cefazolin cefuroxime ceftriaxone cephalexin
cetirizine ciprofloxacin citalopram clarithromycin clavulanic clonazepam clonidine
clopidogrel clozapine codeine colchicine cyclobenzaprine dabigatran dapagliflozin
dexamethasone diazepam diclofenac digoxin diltiazem diphenhydramine donepezil doxazosin
doxycycline duloxetine empagliflozin enalapril enoxaparin escitalopram esomeprazole
ezetimibe famotidine fentanyl ferrous finasteride fluconazole fluoxetine fluticasone
furosemide gabapentin glimepiride glipizide haloperidol heparin hydralazine
hydrochlorothiazide hydrocodone hydrocortisone hydroxychloroquine ibuprofen indapamide
insulin irbesartan isosorbide ketorolac labetalol lamotrigine lansoprazole levetiracetam
levofloxacin levothyroxine linagliptin lisinopril lithium loratadine lorazepam losartan
meloxicam metformin methotrexate methylprednisolone metoclopramide metoprolol metronidazole
midazolam mirtazapine montelukast morphine naproxen nifedipine nitrofurantoin
nitroglycerin olanzapine omeprazole ondansetron oxycodone pantoprazole paracetamol
paroxetine perindopril phenytoin pioglitazone piperacillin potassium pravastatin
prednisolone prednisone pregabalin promethazine propranolol quetiapine ramipril
ranitidine rivaroxaban rosuvastatin salbutamol sertraline simvastatin sitagliptin
spironolactone sulfamethoxazole sumatriptan tamsulosin telmisartan terbinafine
tiotropium topiramate torsemide tramadol trazodone trimethoprim valacyclovir valproate
valsartan vancomycin venlafaxine verapamil warfarin zolpidem

hemoglobin haemoglobin hematocrit platelet glucose creatinine cholesterol triglyceride
troponin ferritin albumin bilirubin sodium calcium magnesium phosphate chloride bicarbonate
lactate lipase amylase urea nitrogen thyroxine thyroid natriuretic peptide procalcitonin
fibrinogen dimer prothrombin leukocyte lymphocyte neutrophil erythrocyte electrolyte
urinalysis

cardiology pulmonology endocrinology nephrology neurology psychiatry gastroenterology
urology orthopedics orthopaedics oncology hematology haematology rheumatology dermatology
radiology pediatrics paediatrics obstetrics gynecology gynaecology ophthalmology surgery
internal medicine emergency intensive family

gastro oesophageal esophageal anaesthesia anesthesia appendicitis appendix pneumonia
hypertension hypotension diabetes asthma bronchitis migraine anaemia anemia fracture
femur femoral hypothyroidism hyperthyroidism hyperlipidaemia hyperlipidemia fibrillation
infarction myocardial reflux dysuria nocturia photophobia palpitations cardiomegaly
consolidation stranding tachycardia bradycardia sepsis cellulitis

discharge summary progress note notes consultation consult report operative
admission referral history physical assessment plan prescription
"""

# Ukrainian stems (see module docstring).
_UK = """
амлодипін лізиноприл метформін сальбутамол будесонід амоксицилін клавуланов ацетилсаліцил
аторвастатин клопідогрел фуросемід бісопролол нітрофурантоїн цефтриаксон сертралін
ібупрофен парацетамол заліза левотироксин тамсулозин омепразол еноксапарин ондансетрон
апіксабан суматриптан аспірин варфарин гепарин інсулін дексаметазон преднізолон
метопролол раміприл еналаприл лозартан валсартан симвастатин розувастатин пантопразол
діклофенак диклофенак цетиризин азитроміцин ципрофлоксацин левофлоксацин метронідазол

гемоглобін гематокрит тромбоцит лейкоцит еритроцит глюкоз креатинін холестерин
тригліцерид тропонін феритин альбумін білірубін натрій калій кальцій магній сечовин
ліпаз амілаз тиреотроп натрійуретичн пептид

кардіолог пульмонолог ендокринолог нефролог невролог психіатр гастроентеролог уролог
ортопед онколог гематолог ревматолог дерматолог радіолог педіатр акушер гінеколог
офтальмолог хірург терапі сімейн медицин приймальн реанімац

гіпертенз гіпотенз діабет астм бронхіт мігрен анемі перелом стегнов гіпотиреоз
гіпертиреоз гіперліпідем фібриляц інфаркт міокард рефлюкс пневмоні апендицит
апендикс анестезі кардіомегалі тахікарді брадикарді сепсис

виписн епікриз щоденник спостереженн консультаці протокол операці променев
дослідженн направленн анамнез рецепт
"""

MEDICAL_TERMS: frozenset[str] = frozenset((_EN + _UK).split())

_MIN_PREFIX = 5


def is_medical_term(token: str) -> bool:
    token = token.lower()
    if token in MEDICAL_TERMS:
        return True
    return len(token) > _MIN_PREFIX and any(
        len(term) >= _MIN_PREFIX and token.startswith(term) for term in MEDICAL_TERMS
    )
