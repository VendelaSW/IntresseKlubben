"""
Demodata inför en visning: ett visningskonto (demo_visning) och ett trettiotal påhittade personer i Stockholm,
med klubbar, events, brev, kontakter, anslagstavlor och klubbchattar. Allt som skapas har användarnamn som börjar
med demo_, så att allt går att ta bort med ett enda kommando efter visningen. Kör från backend/, som
`python -m app.sync_interests` (se CONTRIBUTING.md):

    python -m app.demo_data               visar vad som skulle skapas och vilka intressen som saknas, ändrar inget
    python -m app.demo_data --skapa       skapar allt (visningskontots lösenord hämtas ur DEMO_VISNING_LOSENORD,
                                          eller frågas efter)
    python -m app.demo_data --ta-bort     tar bort alla demo_-användare och allt de har skapat, och inget annat

Matchningen är byggd för att visas från demo_visning: 2-4 personer per nivå (SUPERmatch, Stark, Bra och Okej), plus
personer som inte matchar alls (för Sök och kartan). Vänner och den som har skickat en förfrågan visas aldrig som
förslag, så de är andra personer än matchningarna. Kontrollera nivåerna efteråt med
`python -m app.match_probe demo_visning --antal 30`. Nivåerna stämmer bara mot riktiga vektorer (OpenAI). I testläget
är vektorerna påhittade.

Eventen ligger de närmaste två veckorna räknat från när skriptet körs, så kör det kvällen före eller samma morgon.

Ändrar databasen som DATABASE_URL pekar på, så skriptet skriver ut vilken databas det gäller innan det gör något.
--skapa vägrar om det redan finns demo_-användare: kör --ta-bort först.
"""

import argparse
import getpass
import os
import random
import secrets
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.core.config import settings
from app.crud.contact import answer_request, send_request
from app.crud.event import create_event, invite, set_answer
from app.crud.group import MAX_MEMBERSHIPS, create_group, delete_group, invite_to_group, join_group
from app.crud.group_message import send_group_message
from app.crud.group_post import create_group_post, pin_group_post
from app.crud.message import mark_conversation_read, send_message
from app.crud.profile import create_profile
from app.crud.user import delete_user
from app.db.session import SessionLocal
from app.models.event import EventAnswer, EventVisibility
from app.models.group import Group, GroupScope
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.interest_embedding import InterestEmbedding
from app.models.profile import GenderEnum
from app.models.user import User
from app.schemas.event import EventCreate
from app.schemas.group import GroupCreate
from app.schemas.profile import ProfileCreate
from app.services.matching import MIN_INTERESTS, MIN_TEXT_CHARS, THIN_CHARS, THIN_INTERESTS
from app.services.profile_embeddings import fill_profile_embeddings_report

PREFIX = "demo_"
SHOWCASE = "demo_visning"
PASSWORD_ENV = "DEMO_VISNING_LOSENORD"
STOCKHOLM = "0180"
STOCKHOLMS_LAN = "01"


def _swedish_time(day: date, hour: int, minute: int) -> datetime:
    """Klockslaget i svensk tid. Utan tidszonsdata (Windows utan paketet tzdata) räknas sommartiden ut för hand:
    från sista söndagen i mars till sista söndagen i oktober, kl. 01.00 UTC."""
    try:
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZoneInfo("Europe/Stockholm"))
    except ZoneInfoNotFoundError:
        def last_sunday(month: int) -> datetime:
            d = date(day.year, month, 31)
            return datetime(d.year, month, 31 - (d.weekday() + 1) % 7, 1, tzinfo=timezone.utc)

        winter = datetime(day.year, day.month, day.day, hour, minute, tzinfo=timezone(timedelta(hours=1)))
        summer = last_sunday(3) <= winter < last_sunday(10)
        return winter.replace(tzinfo=timezone(timedelta(hours=2))) if summer else winter
W, M, X = GenderEnum.kvinna, GenderEnum.man, GenderEnum.ickebinar


@dataclass
class Person:
    key: str  # användarnamnet utan demo_
    name: str
    age: int
    gender: GenderEnum
    district: str
    role: str  # visning, super, strong, good, okay, other, friend, request
    interests: list[str]
    text: str
    extra: dict = field(default_factory=dict)

    @property
    def username(self) -> str:
        return SHOWCASE if self.role == "visning" else PREFIX + self.key


# ---------- Personerna ----------
#
# Visningskontot har 7 intressen och en text på 400-500 tecken med tydliga teman: klättring, vandring med kamera,
# kallbad, surdeg, fika och brädspel. Nivåerna byggs efter receptet: SUPERmatch har alla visningskontots intressen
# och lite till och en text som nästan säger samma sak. Stark har 3-4 gemensamma och samma tema från ett eget håll.
# Bra har 1-2 gemensamma, närliggande intressen och en text som delvis överlappar. Okej har högst ett gemensamt och
# en text om annat. Alla som ska kunna föreslås har minst 5 intressen och 200 tecken, så att kortet inte säger
# "baserat på lite information".

SHOWCASE_INTERESTS = ["Bouldering", "Vandring", "Fotografering", "Brädspel", "Surdegsbakning", "Kallbad", "Fika"]

PEOPLE = [
    Person("visning", "Klara Nordin", 29, W, "Södermalm", "visning", SHOWCASE_INTERESTS,
           "Hej! Jag heter Klara och bor på Södermalm. Mina veckor kretsar kring bouldering, och jag klättrar gärna "
           "ett par kvällar i veckan. På helgerna vandrar jag i Stockholms natur med kameran, för fotografering är mitt "
           "sätt att minnas det jag ser. Efter ett kallbad vid Långholmen blir det fika, helst med mitt eget "
           "surdegsbröd. Vardagskvällar spelar jag gärna brädspel med vänner. Jag söker folk att klättra, vandra, "
           "bada och spela med!"),

    # SUPERmatch: alla sju och två till, nästan samma text.
    Person("jonna", "Jonna Ek", 31, W, "Hornstull", "super", SHOWCASE_INTERESTS + ["Sportklättring", "Dagsvandring"],
           "Jag bor vid Hornstull och lever för bouldering, med några kvällar i veckan på klätterväggen. På helgerna "
           "vandrar jag i naturen runt Stockholm och tar med kameran, fotografering är mitt sätt att spara minnen. "
           "Kallbad följt av fika är det bästa jag vet, gärna med surdegsbröd jag bakat själv. På kvällarna blir det "
           "ofta brädspel. Letar efter folk att klättra, vandra, bada och spela med."),
    Person("elliot", "Elliot Sandahl", 33, M, "Liljeholmen", "super", SHOWCASE_INTERESTS + ["Analog fotografering", "Kortspel"],
           "Klättrar bouldering flera kvällar i veckan och vandrar varje helg jag kan, alltid med kameran runt halsen. "
           "Fotografering, både digitalt och på film, är det som binder ihop allt. Jag kallbadar året runt och belönar "
           "mig med fika och en bit av mitt surdegsbröd. Brädspel och kortspel med vänner fyller vardagskvällarna. "
           "Söker nya vänner att klättra, vandra och spela med i Stockholm."),
    Person("tilda", "Tilda Rask", 27, W, "Årsta", "super", SHOWCASE_INTERESTS + ["Friluftsliv", "Bakning"],
           "Bouldering är min stora grej och jag klättrar ett par gånger i veckan. Helgerna går åt till vandring och "
           "friluftsliv med kameran, och fotografering gör att jag ser naturen på ett nytt sätt. Ett kallbad på "
           "morgonen och sedan fika med surdegsbröd jag bakat, det är lycka. Brädspelskvällar med vänner är också ett "
           "måste. Hör av dig om du vill klättra, vandra eller spela!"),

    # Stark match: 3-4 gemensamma, närliggande intressen och samma tema från ett eget håll.
    Person("hampus", "Hampus Berg", 30, M, "Midsommarkransen", "strong",
           ["Bouldering", "Vandring", "Fotografering", "Fika", "Sportklättring", "Camping"],
           "Klättring är det jag gör mest, både bouldering inomhus och sportklättring på klippor ute i Stockholms "
           "skärgård när vädret tillåter. Jag tältar gärna och vandrar flera dagar i sträck, med kameran för att "
           "fånga utsikten från topparna. Efter en lång dag ute är en fika det bästa som finns. Söker klätterkompisar!"),
    Person("nellie", "Nellie Holm", 28, W, "Södermalm", "strong",
           ["Brädspel", "Surdegsbakning", "Fika", "Kallbad", "Kortspel", "Bakning", "Pussel"],
           "Jag bakar surdegsbröd varje helg och tar med det till spelkvällarna, där det blir brädspel, kortspel och "
           "ibland ett stort pussel. Morgnarna börjar ofta med kallbad vid Långholmen och slutar med en lång fika. "
           "Mysiga kvällar med spel och hembakat är min grej. Vill gärna hitta fler att spela och baka med."),
    Person("viktor", "Viktor Lund", 32, M, "Hammarbyhöjden", "strong",
           ["Bouldering", "Kallbad", "Vandring", "Klättring", "Friluftsliv", "Simning"],
           "Jag gillar att röra på mig ute. Bouldering på vintern, klättring utomhus på sommaren och långa "
           "vandringar i Nackareservatet året runt. Kallbad i Hammarby sjö är min morgonrutin, och på sommaren simmar "
           "jag långt. Friluftsliv i alla former, gärna tillsammans med andra som tycker om naturen."),

    # Bra match: 1-2 gemensamma, närliggande intressen och delvis samma tema.
    Person("amira", "Amira Haddad", 34, W, "Vasastan", "good",
           ["Fotografering", "Analog fotografering", "Promenader", "Museer", "Konstutställningar", "Kaffe"],
           "Jag fotograferar mest på stan, gärna analogt med en gammal kamera från loppis. Långa promenader genom "
           "Vasastan och Söder, med stopp på museer och konstutställningar och en kopp kaffe på vägen. Jag tycker om "
           "att se staden med nya ögon och söker folk att gå fotopromenader med."),
    Person("lukas", "Lukas Fors", 26, M, "Kungsholmen", "good",
           ["Brädspel", "Kortspel", "Schack", "Pussel", "Quiz", "Fantasy"],
           "Spelkvällar är det bästa jag vet: brädspel, kortspel och ibland schack. Jag går på quiz med kompisar och "
           "läser fantasy när jag inte spelar. Gillar strategi och långa kampanjspel som tar en hel kväll. Söker fler "
           "som vill spela, både nybörjare och de som kan alla regler."),
    Person("ines", "Ines Moberg", 35, W, "Bromma", "good",
           ["Vandring", "Fika", "Löpning", "Orientering", "Friluftsliv", "Camping"],
           "Jag springer i skogen runt Bromma och har börjat med orientering, som är som en skattjakt med karta. På "
           "helgerna vandrar jag, och en termos fika följer alltid med. Friluftsliv och tältnätter på sommaren gör mig "
           "glad. Söker folk att springa eller vandra med."),

    # Okej match: högst ett gemensamt, några närliggande och en text om annat.
    Person("oliver", "Oliver Strand", 38, M, "Östermalm", "okay",
           ["Fika", "Kaffe", "Restaurangbesök", "Vinprovning", "Matlagning", "Teater"],
           "Mat och dryck är mitt stora intresse. Jag provar nya restauranger, går på vinprovningar och lagar gärna "
           "långa middagar hemma för vänner. Teater några gånger per termin och en ordentlig fika på helgen hör också "
           "till. Söker sällskap till middagar och kvällar på stan."),
    Person("ronja", "Ronja Wester", 30, W, "Gamla stan", "okay",
           ["Yoga", "Pilates", "Simning", "Promenader", "Bakning"],
           "Yoga och pilates håller mig lugn i vardagen, och jag simmar ett par morgnar i veckan. På kvällarna tar jag "
           "långa promenader längs vattnet och på helgen bakar jag kanelbullar. Lugna aktiviteter som får kroppen att "
           "må bra, gärna med någon att prata med."),
    Person("sam", "Sam Lindgren", 29, X, "Kungsholmen", "okay",
           ["Löpning", "Cykling", "Triathlon", "Simning", "Gym"],
           "Jag tränar för mitt första triathlon och lägger mycket tid på löpning, cykling och simning. Gymmet ett par "
           "gånger i veckan för styrkan. Söker träningskompisar som vill köra långpass på helgerna eller intervaller "
           "på kvällarna runt Kungsholmen."),

    # Ingen match: helt andra intressen, för Sök och kartan.
    Person("ali", "Ali Karimi", 36, M, "Bromma", "other", ["Padel", "Golf", "Tennis", "Fotboll", "Innebandy"],
           "Racketsport och bollsporter är mitt liv. Padel flera gånger i veckan, golf på sommaren och tennis när jag "
           "hittar någon att spela med. Jag spelar också korpfotboll och innebandy på vintern. Söker fler att spela med."),
    Person("freja", "Freja Nyman", 41, W, "Vasastan", "other", ["Stickning", "Virkning", "Sömnad", "Keramik", "Akvarell"],
           "Jag skapar med händerna: stickar tröjor, virkar filtar och syr om gamla kläder. På senare tid har jag börjat "
           "dreja keramik och måla akvarell. Söker sällskap till stickcafé och kreativa kvällar där vi pratar och gör "
           "något fint."),
    Person("noah", "Noah Eriksson", 23, M, "Årsta", "other", ["Datorspel", "E-sport", "Tv-spel", "Anime", "Programmering"],
           "Jag pluggar programmering och spelar datorspel på kvällarna, mest strategispel och lite e-sport. Tittar "
           "på anime och gillar att bygga egna små spel. Söker folk att spela med online eller ses på LAN och prata "
           "kod och spel."),
    Person("maja", "Maja Torres", 27, W, "Södermalm", "other", ["Salsa", "Dans", "Spanska", "Språk", "Restaurangbesök"],
           "Dans är min passion, framför allt salsa, och jag går på kurs två kvällar i veckan. Jag pratar spanska och "
           "lär mig gärna fler språk. Söker danspartner och sällskap till språkcaféer och middagar på stan."),
    Person("omar", "Omar Saleh", 44, M, "Hägersten", "other", ["Fiske", "Segling", "Fågelskådning", "Hundar", "Trädgård"],
           "Jag är ute på sjön så ofta jag kan, både för att fiska och segla. Fågelskådning med kikare på morgonen och "
           "trädgården på kvällen. Min hund följer med överallt. Söker andra som gillar livet nära vattnet."),
    Person("tuva", "Tuva Lindell", 25, W, "Östermalm", "other", ["Poesi", "Skrivande", "Bokcirkel", "Teater", "Filosofi"],
           "Jag skriver poesi och noveller och går i en bokcirkel varje månad. Teater och långa samtal om filosofi är "
           "det bästa jag vet. Söker en skrivgrupp eller andra som vill läsa och prata om böcker över en kopp te."),
    Person("leo", "Leo Andersson", 31, M, "Norrmalm", "other", ["Kampsport", "Judo", "Boxning", "Crossfit", "Gym"],
           "Jag tränar kampsport sedan barnsben, mest judo och boxning, och kör crossfit och gym för konditionen. "
           "Söker träningspartner för sparring eller tunga pass på gymmet i city, gärna tidigt på morgonen före jobbet."),
    Person("ella", "Ella Sjögren", 37, W, "Hägersten", "other", ["Gitarr", "Musik", "Ljudböcker", "Science fiction", "Katter"],
           "Jag spelar gitarr och skriver egna låtar, och musik är alltid på hemma. Lyssnar på ljudböcker, helst "
           "science fiction, och delar lägenheten med två katter. Söker folk att jamma med eller gå på spelningar med."),
    Person("linn", "Linn Ahlberg", 52, W, "Bromma", "other", ["Volontärarbete", "Historia", "Museer", "Språk", "Hundar"],
           "Jag arbetar ideellt med läxhjälp och är väldigt intresserad av historia. Museer, gamla kartor och "
           "släktforskning fyller mina helger, och jag läser italienska. Hunden Bosse följer med på allt. Söker sällskap "
           "till föreläsningar och museer."),
    Person("adam", "Adam Wikström", 24, M, "Norrmalm", "other", ["Basket", "Volleyboll", "Beachvolley", "Skidåkning", "Skridskor"],
           "Jag spelar basket i en korpliga och beachvolley hela sommaren. På vintern blir det skidåkning i fjällen och "
           "skridskor på sjöarna runt Stockholm. Söker folk till lag, turneringar och resor till fjällen i vinter."),

    # Vänner (kontakter): visas inte som förslag. De äger några av klubbarna och skriver brev till visningskontot.
    Person("alva", "Alva Berglund", 28, W, "Södermalm", "friend",
           ["Bouldering", "Fika", "Brädspel", "Fotografering", "Kortspel"],
           "Klättrar bouldering och spelar kort och brädspel så fort jag får chansen. Gillar att fotografera vänner och "
           "fika länge efteråt."),
    Person("isak", "Isak Lundqvist", 34, M, "Hägersten", "friend",
           ["Vandring", "Brädspel", "Surdegsbakning", "Schack", "Dagsvandring"],
           "Vandrar i hela Stockholms län och bakar surdeg som en hobby som gått lite för långt. Spelar schack och "
           "brädspel på vardagarna."),
    Person("nora", "Nora Ekdahl", 30, W, "Långholmen", "friend", ["Kallbad", "Yoga", "Fika", "Bakning", "Promenader"],
           "Kallbadar varje morgon vid Långholmen och kör yoga på kvällen. Bakar till fikat och går gärna långa "
           "promenader."),
    Person("felix", "Felix Hagström", 33, M, "Gamla stan", "friend",
           ["Fotografering", "Bouldering", "Cykling", "Kaffe", "Museer"],
           "Fotograferar gator och människor i Gamla stan, klättrar ibland och cyklar överallt. Kaffe och museer på "
           "lediga dagar."),

    # Har skickat en kontaktförfrågan till visningskontot som väntar på svar (visas därför inte som förslag).
    Person("wilma", "Wilma Dahlberg", 27, W, "Södermalm", "request",
           ["Bouldering", "Kallbad", "Fotografering", "Vandring", "Fika"],
           "Ny i Stockholm och söker vänner! Klättrar bouldering, kallbadar och vandrar med kameran på helgerna. Bjuder "
           "gärna på fika."),
]


# ---------- Platser, klubbar och events ----------

# Riktiga platser. Koordinaterna är ungefärliga (WGS84). Många på Södermalm, så att nålarna slås ihop på kartan.
PLACES = {
    "hornstull": ("Hornstull strand", "Södermalm, Stockholm", 59.3158, 18.0340),
    "medborgarplatsen": ("Medborgarplatsen", "Södermalm, Stockholm", 59.3145, 18.0735),
    "langholmen": ("Långholmen", "Södermalm, Stockholm", 59.3190, 18.0000),
    "mariatorget": ("Mariatorget", "Södermalm, Stockholm", 59.3170, 18.0635),
    "tantolunden": ("Tantolunden", "Södermalm, Stockholm", 59.3140, 18.0485),
    "vitabergsparken": ("Vitabergsparken", "Södermalm, Stockholm", 59.3128, 18.0795),
    "stortorget": ("Stortorget", "Gamla stan, Stockholm", 59.3250, 18.0710),
    "humlegarden": ("Humlegården", "Östermalm, Stockholm", 59.3374, 18.0750),
    "ralis": ("Rålambshovsparken", "Kungsholmen, Stockholm", 59.3262, 18.0030),
    "vasaparken": ("Vasaparken", "Vasastan, Stockholm", 59.3395, 18.0415),
    "odenplan": ("Odenplan", "Vasastan, Stockholm", 59.3428, 18.0498),
    "alvik": ("Alviks strand", "Bromma, Stockholm", 59.3335, 17.9800),
    "djurgarden": ("Djurgården", "Djurgården, Stockholm", 59.3270, 18.1040),
    "tyresta": ("Tyresta nationalpark", "Haninge", 59.1730, 18.2290),
}


@dataclass
class Club:
    name: str  # högst 30 tecken
    interest: str
    owner: str  # nyckeln i PEOPLE
    description: str  # högst 200 tecken
    meeting_info: str | None  # högst 100 tecken
    place: str | None
    members: list[str]
    scope: GroupScope = GroupScope.kommun
    invite: list[str] = field(default_factory=list)  # bjuds in av ägaren (måste vara kontakter med ägaren)
    posts: list[tuple[str, str]] = field(default_factory=list)  # (författare, text), den första fästs
    chat: list[tuple[str, str]] = field(default_factory=list)  # (avsändare, text)


CLUBS = [
    Club("Boulderkvällar Söder", "Bouldering", "visning",
         "Vi klättrar bouldering tillsammans, alla nivåer. Vi hjälps åt att läsa problem och peppar varandra.",
         "Tisdagar och torsdagar kl. 18.00 vid Hornstull", "hornstull",
         ["alva", "felix", "jonna", "hampus", "viktor", "wilma", "sam"],
         posts=[("visning", "Välkommen! Skor går att hyra på plats. Skriv i chatten om du kommer för första gången."),
                ("alva", "Nya problem på den lutande väggen, de gröna är riktigt sköna.")],
         chat=[("alva", "Någon som kör på torsdag?"), ("visning", "Jag är där 18!"),
               ("felix", "Jag tar med kameran och fotar lite om ni är okej med det."), ("visning", "Gärna!")]),
    Club("Söderbrädspel", "Brädspel", "visning",
         "Spelkvällar med allt från lätta partyspel till långa strategispel. Vi lär ut reglerna, kom som du är.",
         "Varannan onsdag kl. 18.30 nära Medborgarplatsen", "medborgarplatsen",
         ["isak", "alva", "nellie", "lukas", "elliot", "noah"],
         posts=[("visning", "Ta gärna med ett spel ni vill visa. Vi har ett hörn för nybörjare varje gång.")],
         chat=[("isak", "Jag tar med Carcassonne."), ("lukas", "Och jag en ny kortspelsfavorit!"),
               ("visning", "Perfekt, då blir det två bord.")]),
    Club("Kallbadarna Långholmen", "Kallbad", "nora",
         "Morgondopp året runt följt av varm dryck. Vi badar i din takt och går aldrig i ensamma.",
         "Lördagar och söndagar kl. 08.00, Långholmen", "langholmen",
         ["visning", "viktor", "nellie", "wilma", "ronja"],
         posts=[("nora", "Ta med handduk, mössa och något varmt att dricka. Vattnet är kallt nu!")],
         chat=[("nora", "8 grader i vattnet i morse."), ("visning", "Härligt, jag kommer på lördag."),
               ("viktor", "Jag tar med extra termos.")]),
    Club("Surdegscirkeln", "Surdegsbakning", "nellie",
         "Vi delar surdegsgrundar, recept och misslyckanden. Ibland bakar vi ihop, ibland bara byter bröd.",
         "Första lördagen i månaden kl. 13.00, Mariatorget", "mariatorget",
         ["visning", "isak", "tilda", "nora", "oliver"],
         posts=[("nellie", "Jag har extra grund att dela med mig av, skriv om du vill ha!"),
                ("isak", "Tips: låt degen jäsa i kylen över natten, det gör underverk.")],
         chat=[("tilda", "Mitt bröd blev platt igen…"), ("nellie", "För varm deg kanske? Prova kallare vatten."),
               ("visning", "Samma hände mig i somras, kylen räddade det.")]),
    Club("Fotopromenaden", "Fotografering", "felix",
         "Vi går runt i stan med kameran eller mobilen och delar tips. Perfekt om du vill lära dig se motiv.",
         "Lördagar kl. 11.00, olika platser i innerstan", "stortorget",
         ["amira", "elliot", "alva", "jonna"], invite=["visning"],
         posts=[("felix", "Temat i november är speglingar. Visa gärna era bästa bilder i chatten.")],
         chat=[("amira", "Jag tar med min analoga kamera på lördag."), ("felix", "Kul, vi ses vid Stortorget.")]),
    Club("Fikagänget Östermalm", "Fika", "oliver",
         "Vi fikar och pratar om allt och inget. Ett lätt sätt att träffa nya människor utan krav.",
         "Söndagar kl. 14.00 i ett kafé vid Humlegården", "humlegarden",
         ["ines", "ronja", "linn", "tuva"]),
    Club("Löparna vid Rålis", "Löpning", "sam",
         "Lugna och sociala löprundor runt Kungsholmen, i ett tempo där man kan prata. Alla nivåer.",
         "Söndagar kl. 10.00 vid Rålambshovsparken", "ralis",
         ["ines", "adam", "leo"]),
    Club("Stickcafé Vasastan", "Stickning", "freja",
         "Ta med ditt stickprojekt och sitt med oss. Vi hjälper till med tappade maskor och mönster.",
         "Måndagar kl. 17.30 vid Vasaparken", "vasaparken",
         ["ella", "linn", "tuva"]),
    Club("Padel i Bromma", "Padel", "ali",
         "Vi spelar padel i lugn takt och byter partner mellan matcherna. Racket kan lånas.",
         "Lördagar kl. 12.00, Alvik", "alvik",
         ["adam", "leo", "oliver"]),
    Club("Schack på Odenplan", "Schack", "lukas",
         "Vänskapsmatcher och blixtschack för alla nivåer. Ta med ett bräde om du har ett.",
         "Torsdagar kl. 17.00, Odenplan", "odenplan",
         ["isak", "noah", "ella"]),
    Club("Yoga i Tantolunden", "Yoga", "ronja",
         "Mjuk yoga utomhus så länge vädret tillåter, inomhus på vintern. Ta med egen matta.",
         "Onsdagar kl. 18.00 i Tantolunden", "tantolunden",
         ["nora", "maja", "freja"]),
    Club("Djurgårdsvandrarna", "Dagsvandring", "ines",
         "Dagsvandringar på Djurgården och runt stan. Lugnt tempo, fika på vägen.",
         "Varannan söndag kl. 10.00, Djurgårdsbron", "djurgarden",
         ["hampus", "viktor", "tilda", "omar"]),
    # Hela länet.
    Club("Vandring i Stockholms län", "Vandring", "isak",
         "Heldagsvandringar i länets naturreservat och nationalparker. Vi samåker från stan.",
         "En lördag i månaden, samling vid T-centralen kl. 08.30", "tyresta",
         ["jonna", "hampus", "ines", "tilda"], scope=GroupScope.lan, invite=["visning"],
         posts=[("isak", "Nästa tur går till Tyresta. Ta med matsäck och bra skor.")]),
    Club("Klippklättring i länet", "Sportklättring", "hampus",
         "Vi klättrar ute på klipporna runt Stockholm när vädret tillåter. Erfarna hjälper nya.",
         "Helger när det är torrt, plats meddelas i chatten", None,
         ["jonna", "viktor", "elliot"], scope=GroupScope.lan),
    # Hela Sverige.
    Club("Analoga fotografer", "Analog fotografering", "elliot",
         "För alla som fotar på film. Vi delar tips om kameror, framkallning och var man hittar film.",
         None, None, ["amira", "felix"], scope=GroupScope.country,
         posts=[("elliot", "Var framkallar ni färgfilm nu för tiden? Dela gärna era favoriter.")]),
    Club("Brädspelsnördar Sverige", "Brädspel", "lukas",
         "Vi tipsar om spel, ordnar onlinekvällar och träffas på spelmässor runt om i landet.",
         None, None, ["noah", "nellie", "elliot"], scope=GroupScope.country),
]


@dataclass
class Ev:
    title: str
    interest: str
    host: str
    day: int  # dagar efter i dag
    hour: int
    minute: int
    place: str
    description: str
    club: str | None = None
    answers: dict[str, str] = field(default_factory=dict)  # nyckel -> "yes" eller "maybe"
    invite: list[str] = field(default_factory=list)  # bjuds in av värden (kontakter), svarar inte


EVENTS = [
    Ev("Nybörjarkväll i boulder", "Bouldering", "visning", 2, 18, 0, "hornstull",
       "Första gången? Vi visar grunderna och klättrar enkla problem tillsammans.", "Boulderkvällar Söder",
       {"alva": "yes", "felix": "yes", "jonna": "yes", "wilma": "maybe", "sam": "maybe"}),
    Ev("Spelkväll: lätta spel", "Brädspel", "visning", 5, 18, 30, "medborgarplatsen",
       "Spel som är lätta att komma igång med. Kom ensam eller ta med en vän.", "Söderbrädspel",
       {"isak": "yes", "lukas": "yes", "nellie": "maybe", "noah": "yes"}),
    Ev("Morgondopp på Långholmen", "Kallbad", "nora", 3, 8, 0, "langholmen",
       "Ett kort dopp och sedan varm dryck. Ta med handduk och varma kläder.", "Kallbadarna Långholmen",
       {"visning": "yes", "viktor": "yes", "wilma": "yes", "ronja": "maybe"}),
    Ev("Bakdag: surdeg från grunden", "Surdegsbakning", "nellie", 6, 13, 0, "mariatorget",
       "Vi går igenom grund, degning och bakning. Alla får ta med sig grund hem.", "Surdegscirkeln",
       {"visning": "yes", "isak": "yes", "tilda": "yes", "oliver": "maybe"}),
    Ev("Fotopromenad i Gamla stan", "Fotografering", "felix", 4, 11, 0, "stortorget",
       "Vi letar speglingar och ljus i gränderna. Mobil räcker gott.", "Fotopromenaden",
       {"visning": "maybe", "amira": "yes", "elliot": "yes", "alva": "yes"}),
    Ev("Fika vid Humlegården", "Fika", "oliver", 7, 14, 0, "humlegarden",
       "Ett lugnt fika för den som vill träffa nya människor.", "Fikagänget Östermalm",
       {"ines": "yes", "ronja": "yes", "linn": "maybe"}),
    Ev("Lugn löprunda 5 km", "Löpning", "sam", 7, 10, 0, "ralis",
       "En social runda i lugnt tempo, med fika efteråt för den som vill.", "Löparna vid Rålis",
       {"ines": "yes", "adam": "yes", "leo": "maybe"}),
    Ev("Stickträff med fika", "Stickning", "freja", 9, 17, 30, "vasaparken",
       "Ta med ditt projekt, nybörjare får hjälp att komma igång.", "Stickcafé Vasastan",
       {"ella": "yes", "tuva": "maybe"}),
    Ev("Padel-dubbel för alla nivåer", "Padel", "ali", 8, 12, 0, "alvik",
       "Vi blandar lagen så att alla får spela med alla.", "Padel i Bromma",
       {"adam": "yes", "leo": "yes", "oliver": "maybe"}),
    Ev("Blixtschack i parken", "Schack", "lukas", 10, 16, 0, "odenplan",
       "Fem minuter per spelare och parti. Alla nivåer är välkomna.", "Schack på Odenplan",
       {"isak": "yes", "noah": "yes"}),
    Ev("Yoga i solnedgången", "Yoga", "ronja", 11, 17, 0, "tantolunden",
       "Mjuk yoga på gräset. Ta med matta och en filt.", "Yoga i Tantolunden",
       {"nora": "yes", "maja": "maybe", "freja": "yes"}),
    Ev("Dagsvandring på Djurgården", "Dagsvandring", "ines", 12, 10, 0, "djurgarden",
       "En lugn tur på några timmar genom Djurgårdens stigar. Ta med fika.", "Djurgårdsvandrarna",
       {"hampus": "yes", "tilda": "yes", "omar": "maybe"}),
    Ev("Heldag i Tyresta", "Vandring", "isak", 13, 9, 0, "tyresta",
       "Runt 15 km genom urskogen. Vi samåker från stan, säg till om du har plats i bilen.",
       "Vandring i Stockholms län", {"jonna": "yes", "hampus": "yes", "ines": "maybe"}, invite=["visning"]),
    Ev("Kaffeprovning på Mariatorget", "Kaffe", "oliver", 1, 15, 0, "mariatorget",
       "Vi provar bönor från tre rosterier och pratar bryggning.", None, {"amira": "yes", "felix": "maybe"}),
    Ev("Quizkväll på Söder", "Quiz", "lukas", 9, 19, 0, "medborgarplatsen",
       "Lag om fyra, men vi sätter ihop dig med andra om du kommer ensam.", None,
       {"noah": "yes", "tuva": "yes", "maja": "maybe"}),
    Ev("Kortspelskväll", "Kortspel", "alva", 6, 19, 0, "vitabergsparken",
       "Vi lär ut några klassiska kortspel och spelar så länge vi orkar.", None,
       {"lukas": "yes", "elliot": "maybe"}, invite=["visning"]),
]

# Kontakter med visningskontot (godkända), och brev: (avsändare, text). Den sista i varje samtal avgör om det är oläst.
FRIENDS = ["alva", "isak", "nora", "felix"]
REQUEST_FROM = ["wilma"]
LETTERS = {
    "alva": [("alva", "Hej! Kul att du startade boulderklubben. Ses vi på torsdag?"),
             ("visning", "Absolut, jag är där vid sex!"),
             ("alva", "Toppen. Ska vi ta en fika efteråt?")],
    "isak": [("isak", "Jag har bjudit in dig till vandringsklubben och turen till Tyresta, hoppas du kan följa med!")],
    "nora": [("nora", "Vattnet var iskallt i morse, du hade älskat det."),
             ("visning", "Haha, jag kommer på lördag!")],
    "felix": [("felix", "Jag fick några fina bilder från senaste klättringen, vill du se dem?")],
}
# Samtal som visningskontot har läst (de andra är olästa).
READ = ["nora"]
# Kontakter mellan de andra, så att profilerna inte ser tomma ut.
OTHER_CONTACTS = [("alva", "felix"), ("isak", "nora"), ("jonna", "hampus"), ("lukas", "noah"), ("ines", "tilda")]


def _contact_pairs() -> set[frozenset[str]]:
    return {frozenset(("visning", k)) for k in FRIENDS} | {frozenset(pair) for pair in OTHER_CONTACTS}


# ---------- Hjälpfunktioner ----------

def _database_label() -> str:
    url = make_url(settings.database_url)
    return f"{url.get_backend_name()} {url.host or url.database}"


def _people() -> dict[str, Person]:
    return {p.key: p for p in PEOPLE}


def _interest_index(db: Session) -> dict[str, Interest]:
    """Aktiva intressen efter namn (små bokstäver). Bibliotekets går före användarnas egna med samma namn."""
    index: dict[str, Interest] = {}
    rows = db.query(Interest).filter(Interest.status == InterestStatus.active.value).all()
    for interest in sorted(rows, key=lambda i: i.source != InterestSource.library.value):
        index.setdefault(interest.name.lower(), interest)
    return index


def needed_interest_names() -> list[str]:
    names = {n for p in PEOPLE for n in p.interests}
    names |= {c.interest for c in CLUBS} | {e.interest for e in EVENTS}
    return sorted(names)


def missing_interests(db: Session) -> list[str]:
    index = _interest_index(db)
    return [n for n in needed_interest_names() if n.lower() not in index]


def interests_without_vector(db: Session) -> list[str]:
    """Intressena som skriptet använder och som saknar vektor. Utan dem räknas inte de närliggande intressena, och alla
    förslag får "baserat på lite information"."""
    index = _interest_index(db)
    ids = {index[n.lower()].id: n for n in needed_interest_names() if n.lower() in index}
    have = {i for (i,) in db.query(InterestEmbedding.interest_id).filter(InterestEmbedding.interest_id.in_(ids))}
    return sorted(name for interest_id, name in ids.items() if interest_id not in have)


def check_recipe() -> list[str]:
    """Kontrollerar att listorna följer receptet, utan databasen. Ger en rad per problem."""
    people = _people()
    problems = []
    showcase = people["visning"]
    if not 6 <= len(showcase.interests) <= 8:
        problems.append(f"visningskontot har {len(showcase.interests)} intressen (ska ha 6-8)")
    if not 400 <= len(showcase.text) <= 500:
        problems.append(f"visningskontots text är {len(showcase.text)} tecken (ska vara 400-500)")
    mine = set(showcase.interests)
    shared_rule = {"super": (len(mine), len(mine)), "strong": (3, 4), "good": (1, 2), "okay": (0, 1), "other": (0, 0)}
    for p in PEOPLE:
        if len(set(p.interests)) != len(p.interests):
            problems.append(f"{p.key} har samma intresse två gånger")
        if len(p.text) > 800:
            problems.append(f"{p.key}: texten är för lång ({len(p.text)})")
        if p.role in shared_rule:
            low, high = shared_rule[p.role]
            shared = len(mine & set(p.interests))
            if not low <= shared <= high:
                problems.append(f"{p.key} ({p.role}) har {shared} gemensamma intressen (ska ha {low}-{high})")
            if len(p.interests) < max(MIN_INTERESTS, THIN_INTERESTS) or len(p.text) < max(MIN_TEXT_CHARS, THIN_CHARS):
                problems.append(f"{p.key}: för lite för ett säkert förslag ({len(p.interests)} intressen, {len(p.text)} tecken)")
    for c in CLUBS:
        if len(c.name) > 30 or len(c.description) > 200 or (c.meeting_info and len(c.meeting_info) > 100):
            problems.append(f"klubben {c.name}: namn, beskrivning eller tid är för lång")
        for key in [c.owner, *c.members, *c.invite]:
            if key not in people:
                problems.append(f"klubben {c.name}: okänd person {key}")
        for key in c.invite:
            if frozenset((c.owner, key)) not in _contact_pairs():
                problems.append(f"klubben {c.name}: {c.owner} kan bara bjuda in sina kontakter")
    club_names = {c.name for c in CLUBS}
    for e in EVENTS:
        if e.club and e.club not in club_names:
            problems.append(f"eventet {e.title}: okänd klubb {e.club}")
        if not 0 < e.day <= 14:
            problems.append(f"eventet {e.title}: ska ligga inom två veckor")
        for key in [e.host, *e.answers, *e.invite]:
            if key not in people:
                problems.append(f"eventet {e.title}: okänd person {key}")
        for key in e.invite:
            if frozenset((e.host, key)) not in _contact_pairs():
                problems.append(f"eventet {e.title}: {e.host} kan bara bjuda in sina kontakter")
    memberships: dict[str, int] = {}
    for c in CLUBS:
        for key in {c.owner, *c.members}:
            memberships[key] = memberships.get(key, 0) + 1
    for key, count in memberships.items():
        if count > MAX_MEMBERSHIPS:
            problems.append(f"{key} är med i {count} klubbar (max {MAX_MEMBERSHIPS})")
    return problems


def _spread_back(db: Session, rows: list, last: timedelta, step: timedelta) -> None:
    """Flyttar tillbaka tiden på inlägg och meddelanden, så att de inte alla står på samma minut: det sista `last` före nu,
    och varje tidigare `step` till före det. Ordningen är densamma som de skapades i."""
    now = datetime.now(timezone.utc)
    for i, row in enumerate(reversed(rows)):
        row.created_at = now - last - step * i
    db.commit()


def demo_users(db: Session) -> list[User]:
    """Alla användare vars namn börjar med demo_. autoescape, eftersom _ annars är ett jokertecken i LIKE och till exempel
    demox skulle räknas med. Kontrolleras en gång till i Python för säkerhets skull."""
    rows = db.query(User).filter(User.username.startswith(PREFIX, autoescape=True)).order_by(User.id).all()
    return [u for u in rows if u.username.startswith(PREFIX)]


def _showcase_password() -> str:
    password = os.environ.get(PASSWORD_ENV)
    if password:
        return password
    if not sys.stdin.isatty():
        raise SystemExit(f"Ange visningskontots lösenord i {PASSWORD_ENV}.")
    password = getpass.getpass(f"Lösenord för {SHOWCASE} (syns inte när du skriver): ")
    if len(password) < 8:
        raise SystemExit("Lösenordet måste ha minst 8 tecken.")
    return password


# ---------- Skapa ----------

def create(db: Session, showcase_password: str, rng: random.Random | None = None, log=print) -> dict[str, int]:
    """Skapar allt. Ger antal skapade per sort."""
    rng = rng or random.Random(2026)
    if demo_users(db):
        raise SystemExit("Det finns redan demo_-användare. Kör först: python -m app.demo_data --ta-bort")
    problems = check_recipe()
    if problems:
        raise SystemExit("Listorna följer inte receptet:\n  " + "\n  ".join(problems))
    index = _interest_index(db)
    missing = missing_interests(db)
    if missing:
        log("VARNING: de här intressena finns inte och hoppas över: " + ", ".join(missing))

    now = datetime.now(timezone.utc)
    today = _swedish_time(date.today(), 12, 0).date()
    users: dict[str, User] = {}

    # Personer
    for p in PEOPLE:
        password = showcase_password if p.role == "visning" else secrets.token_urlsafe(32)
        user = User(username=p.username, email=None, password_hash=hash_password(password), onboarding_completed_at=now)
        db.add(user)
        db.commit()
        ids = [index[n.lower()].id for n in p.interests if n.lower() in index]
        birth = date(today.year - p.age, 1 + rng.randrange(12), 1 + rng.randrange(28))
        if birth > today.replace(year=today.year - p.age):
            birth = birth.replace(year=birth.year - 1)
        try:
            create_profile(db, user.id, ProfileCreate(
                name=p.name, birth_date=birth, gender=p.gender, municipality_code=STOCKHOLM,
                profile_text=p.text, interest_ids=ids, district=p.district,
            ))
        except Exception:
            db.rollback()
            delete_user(db, user)
            db.commit()
            raise
        users[p.key] = user
        log(f"  {p.username:<16} {p.role:<7} {len(ids)} intressen, {len(p.text)} tecken")

    def uid(key: str) -> int:
        return users[key].id

    # Kontakter och förfrågan
    for key in FRIENDS:
        request = send_request(db, uid(key), uid("visning"))
        answer_request(db, request.id, uid("visning"), "accept")
    for key in REQUEST_FROM:
        send_request(db, uid(key), uid("visning"))
    for a, b in OTHER_CONTACTS:
        request = send_request(db, uid(a), uid(b))
        answer_request(db, request.id, uid(b), "accept")

    # Klubbar
    groups: dict[str, Group] = {}
    for c in CLUBS:
        interest = index.get(c.interest.lower())
        if interest is None:
            log(f"  hoppar över klubben {c.name}: intresset {c.interest} saknas")
            continue
        place = PLACES.get(c.place) if c.place else None
        scope_code = {GroupScope.kommun: STOCKHOLM, GroupScope.lan: STOCKHOLMS_LAN}.get(c.scope)
        group = create_group(db, users[c.owner], GroupCreate(
            name=c.name, description=c.description, meeting_info=c.meeting_info,
            place_name=place[0] if place else None, address=place[1] if place else None,
            latitude=place[2] if place else None, longitude=place[3] if place else None,
            interest_id=interest.id, scope=c.scope, scope_code=scope_code,
            municipality_code=STOCKHOLM if c.scope == GroupScope.kommun else None,
            members_can_invite=True,
        ))
        for key in c.members:
            join_group(db, group, users[key])
        if c.invite:
            invite_to_group(db, group, uid(c.owner), [uid(k) for k in c.invite])
        posts = []
        for i, (author, content) in enumerate(c.posts):
            posts.append(create_group_post(db, group.id, uid(author), content))
            if i == 0:
                pin_group_post(db, posts[0])
        _spread_back(db, posts, last=timedelta(days=1), step=timedelta(days=2))
        chat = [send_group_message(db, group.id, uid(sender), content) for sender, content in c.chat]
        _spread_back(db, chat, last=timedelta(minutes=20 + 37 * len(groups)), step=timedelta(minutes=25))
        groups[c.name] = group
        log(f"  klubben {c.name} ({c.scope.value}, {c.interest}) med {len(c.members) + 1} medlemmar")

    # Events
    events = 0
    for e in EVENTS:
        interest = index.get(e.interest.lower())
        if interest is None:
            log(f"  hoppar över eventet {e.title}: intresset {e.interest} saknas")
            continue
        group = groups.get(e.club) if e.club else None
        place_name, address, latitude, longitude = PLACES[e.place]
        day = today + timedelta(days=e.day)
        starts_at = _swedish_time(day, e.hour, e.minute)
        event = create_event(db, uid(e.host), EventCreate(
            title=e.title, description=e.description, interest_id=interest.id,
            starts_at=starts_at, ends_at=starts_at + timedelta(hours=2),
            place_name=place_name, address=address, latitude=latitude, longitude=longitude,
            visibility=EventVisibility.open, group_id=group.id if group is not None else None,
        ))
        for key, answer in e.answers.items():
            set_answer(db, event, uid(key), EventAnswer.yes if answer == "yes" else EventAnswer.maybe)
        if e.invite:
            invite(db, event, uid(e.host), [uid(k) for k in e.invite], [])
        events += 1
        log(f"  eventet {e.title} ({day} kl. {e.hour:02}.{e.minute:02})")

    # Brev
    for n, (other, messages) in enumerate(LETTERS.items()):
        sent = []
        for sender, text in messages:
            recipient = "visning" if sender == other else other
            sent.append(send_message(db, uid(sender), uid(recipient), text))
        _spread_back(db, sent, last=timedelta(minutes=15 + 90 * n), step=timedelta(minutes=40))
        mark_conversation_read(db, uid(other), uid("visning"))
        if other in READ:
            mark_conversation_read(db, uid("visning"), uid(other))

    ok, report = fill_profile_embeddings_report(db)
    log(f"  profilvektorer: {report}")
    if not ok:
        log("  VARNING: utan vektorer räknas matchningen utan textdelen. Kör python -m app.sync_embeddings när det går.")
    return {"users": len(users), "clubs": len(groups), "events": events}


# ---------- Ta bort ----------

def remove(db: Session, log=print) -> tuple[int, int]:
    """Tar bort alla demo_-användare och allt de har skapat: klubbarna först (annars tar en riktig medlem över dem),
    sedan användarna, som tar med sig sina events, brev, kontakter, svar och inlägg. Ger (användare, klubbar)."""
    users = demo_users(db)
    ids = [u.id for u in users]
    clubs = db.query(Group).filter(Group.created_by.in_(ids)).all() if ids else []
    for club in clubs:
        name = club.name
        delete_group(db, club, club.created_by)
        log(f"  tog bort klubben {name}")
    for user in users:
        username = user.username
        delete_user(db, user)
        db.commit()
        log(f"  tog bort {username}")
    return len(users), len(clubs)


# ---------- Kommandot ----------

def main() -> None:
    parser = argparse.ArgumentParser(description="Demodata för en visning (demo_-användare i Stockholm).")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--skapa", action="store_true", help="skapa allt")
    action.add_argument("--ta-bort", action="store_true", help="ta bort alla demo_-användare och allt de har skapat")
    args = parser.parse_args()

    print(f"Databas: {_database_label()}")
    with SessionLocal() as db:
        if args.ta_bort:
            users, clubs = remove(db)
            print(f"Klart: {users} användare och {clubs} klubbar borttagna, med allt de hade skapat.")
            return
        if args.skapa:
            if demo_users(db):
                raise SystemExit("Det finns redan demo_-användare. Kör först: python -m app.demo_data --ta-bort")
            password = _showcase_password()
            counts = create(db, password)
            print(f"Klart: {counts['users']} användare, {counts['clubs']} klubbar och {counts['events']} events. "
                  f"Logga in som {SHOWCASE}. Kontrollera nivåerna: python -m app.match_probe {SHOWCASE} --antal 30")
            return

        # Torrkörning
        existing = demo_users(db)
        print(f"Finns redan: {len(existing)} demo_-användare." + (" Kör --ta-bort före --skapa." if existing else ""))
        problems = check_recipe()
        print("Receptet: " + ("följs." if not problems else "\n  " + "\n  ".join(problems)))
        missing = missing_interests(db)
        print("Intressen: " + ("alla finns." if not missing else "SAKNAS och hoppas över: " + ", ".join(missing)))
        no_vector = interests_without_vector(db)
        if no_vector:
            print(f"Intressevektorer: {len(no_vector)} saknas ({', '.join(no_vector[:8])}{' …' if len(no_vector) > 8 else ''}). "
                  "Kör python -m app.sync_embeddings först, annars saknas de närliggande intressena i matchningen.")
        else:
            print("Intressevektorer: alla finns.")
        roles: dict[str, list[str]] = {}
        for p in PEOPLE:
            roles.setdefault(p.role, []).append(p.username)
        for role, names in roles.items():
            print(f"  {role:<8} {', '.join(names)}")
        print(f"{len(PEOPLE)} personer, {len(CLUBS)} klubbar, {len(EVENTS)} events. Inget ändrades. Kör med --skapa.")


if __name__ == "__main__":
    main()
