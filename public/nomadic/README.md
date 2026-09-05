# Nomadic Tribe opening assets

Source: https://2019.makemepulse.com/ (makemepulse, 2019).
Copied from the user's extracted `makemepulse-2019/assets/img/` mirror on 2026-09-05:

- `background_blue_pattern.jpg`: original 512×512 blue paper tile.
- `background_white_pattern.jpg`: original 512×512 light paper tile.
- `logo.png`: original transparent NOMADIC TRIBE title.

These three image files retain their original bytes. Upstream ownership is unchanged;
no additional upstream license is asserted here.

The opening is independently implemented in `src/viewer/openingScene.js`,
`openingMotion.js` and `opening.css`, using the viewer's existing scene switching,
render scheduling and GUI. No extracted JavaScript bundle or stylesheet is shipped.
The loading line is authored SVG. The final state is the light paper background only;
the source's 3D chapter, illustrated panels and audio are outside this adaptation.
