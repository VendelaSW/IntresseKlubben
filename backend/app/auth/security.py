"""
Lösenordshashning för registrering och inloggning.

Delas mellan E:s registrering (hash_password vid create_user) och
F:s inloggning (verify_password vid login). Lösenord lagras ALDRIG
i klartext - bara hashen sparas i User.password_hash.
"""

import bcrypt


def hash_password(password: str) -> str:
    """
    Hashar ett lösenord i klartext till en sträng som är säker att
    spara i databasen (User.password_hash).

    Används av crud.user.create_user() innan en ny User skapas.
    """
    password_bytes = password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """
    Kollar om ett lösenord i klartext matchar en sparad hash.

    Returnerar True/False - kastar inget undantag vid felaktigt
    lösenord, så F:s login-funktion kan hantera det som ett vanligt
    "fel lösenord"-fall istället för en krasch.
    """
    password_bytes = password.encode("utf-8")
    hash_bytes = password_hash.encode("utf-8")
    try:
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except ValueError:
        # password_hash är inte en giltig bcrypt-hash (t.ex. tom sträng)
        return False
