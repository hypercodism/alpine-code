# Images

## When a product needs pictures

Food, places, rooms, people, products, work, travel, animals: if the person would look at it in real life, show a
photo. Tools, money and admin screens usually need none; icons and type carry them.

## Finding free photos: Openverse

Openverse searches openly licensed images and needs no key:

```
https://api.openverse.org/v1/images/?q=sourdough%20bread&license_type=commercial,modification&category=photograph&size=large&aspect_ratio=square&page_size=20
```

- `q`: English works best (most titles and tags are English): "sourdough bread", "hair salon interior".
- `license_type=commercial,modification`: only licences that allow a business to use and crop them (CC0, public
  domain, CC BY, CC BY-SA). Never use NC or ND images.
- `category=photograph`, `size=large`, `aspect_ratio=square|wide|tall`: match the crop of the slot.
- Each result has `url` (the file), `creator`, `license`, `license_version`, `license_url`, `foreign_landing_url`
  (the page it came from), `attribution` (a ready line), `width`, `height`, and `thumbnail`.
- Send a `User-Agent` naming the product. Anonymous use is rate limited: search a few times, not per image.

Choose with the direction in mind:

- One set should look like one shoot: similar light (warm daylight vs. cool studio), similar background, similar
  distance and crop. Reject the one that is darker, busier or a different style, even if its subject is right.
- Prefer photos without readable text, logos, watermarks or recognisable faces of private people.
- Look at the thumbnail before downloading; at least 1200 px on the long side for a hero, 600 for a thumbnail.

## Downloading and crediting

Never hotlink: the source may disappear or slow the app. Download into the project:

- Put them where the app serves static files (`public/images/` in a Vite app), with plain names
  (`salt-bread.jpg`), resized to at most about 1600 px on the long side.
- Write `public/images/CREDITS.md`, one entry per file:

```
- salt-bread.jpg: "Salt butter roll" by Jane Doe, CC BY 2.0
  https://creativecommons.org/licenses/by/2.0/ (source: https://www.flickr.com/photos/...)
```

- CC BY and CC BY-SA require attribution where the image is used: add a quiet line on the product's about or credits
  screen, or in the footer ("사진: Jane Doe, CC BY 2.0"), linking to the source. CC0 and public domain need none; list
  them in CREDITS.md anyway.
- CC BY-SA: a cropped or edited version must keep the same licence; say so in CREDITS.md.

Openverse indexes what others marked; check the source page when the licence matters (a logo, a person, a brand) and
pick another image when in doubt.

## When nothing fits

Draw a placeholder that belongs to the direction, not a grey box: the accent at 10-15 % on the page colour, the
item's name or an icon from the product's icon set centred, at the slot's real crop. It should look intended if it
ships.

## The person's own photos

Their own pictures are always better for a real business. Tell them once, in plain words, that they can replace any
photo: the files are in `public/images/` (or ask you to swap them), and the credits line can go when no credited
photo is left.

## In the look question's previews

Planned screens are real code and use real pictures as above. Only the look question's `html` previews cannot load
pictures: draw the slot at its real crop with `bg-surface` and a short muted line of what goes there.
