# EMIS+ app illustrations. One Seedream 5.0 pro call each, 1024x1024, white
# background so they sit on white cards. Style follows the clean flat vector
# look of modern medical sites; palette from the EMIS+ logo.
STYLE = (" Flat vector illustration, clean modern medical app style, soft rounded shapes, "
         "gentle gradients, palette emerald green #209070 and soft blue #4068B0 with small "
         "accents of coral #F07068 and amber #F8C048, plain pure white background, no text, "
         "no letters, no logo, no watermark, centred composition with generous margins.")

JOBS = [
    {"id": "hero-home", "size": "1024x1024", "prompt":
        "A friendly stylised nurse in teal scrubs handing a box of wound dressings to a smiling elderly "
        "man seated in a bright Singapore living room, a tidy shelf with neatly arranged medical supplies "
        "behind them, simple faces, warm and reassuring." + STYLE},
    {"id": "tile-wound", "size": "1024x1024", "prompt":
        "A single square foam wound dressing with a rolled gauze bandage and a small bottle of saline, "
        "product icon style, slightly isometric." + STYLE},
    {"id": "tile-ostomy", "size": "1024x1024", "prompt":
        "An ostomy pouch with a round skin barrier ring and a small tube of barrier paste, product icon "
        "style, slightly isometric." + STYLE},
    {"id": "tile-compression", "size": "1024x1024", "prompt":
        "A lower leg wearing a knee-high medical compression stocking with a soft measuring tape curled "
        "beside it, product icon style." + STYLE},
    {"id": "tile-hygiene", "size": "1024x1024", "prompt":
        "A pair of blue nitrile gloves, a pump bottle of hand sanitiser and a folded face mask, product "
        "icon style, slightly isometric." + STYLE},
    {"id": "banner-learn", "size": "1024x1024", "prompt":
        "An open book with a stethoscope resting on it, a round play button badge floating above and a "
        "small potted plant, patient education concept." + STYLE},
    {"id": "banner-tools", "size": "1024x1024", "prompt":
        "A clipboard with a simple line chart, a measuring tape and a ruler arranged neatly, health "
        "tracking and measuring concept." + STYLE},
    {"id": "banner-rewards", "size": "1024x1024", "prompt":
        "A small gift box with a shining star coin and a soft heart shape, loyalty rewards concept, "
        "amber and green." + STYLE},
    {"id": "banner-assistant", "size": "1024x1024", "prompt":
        "A friendly round chat bubble robot assistant with a small medical cross badge, holding a "
        "product box, helpful and approachable." + STYLE},
]
for j in JOBS:
    assert len(j["prompt"]) < 800, j["id"]
