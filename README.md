# Apprenticeship-Website 
Adobe's Apprenticeship Information and Application Platform

## Description

This is a website designed to provide potential apprentices in Switzerland with an authentic insight into our apprenticeship program. Visitors can read about the program and submit applications directly through our website.

This site is built using the Edge Delivery Services design system, AEM for content management, and Milo front-end utilities.

## Adding blocks, custom blocks

This is a small instruction of what hs to be done when you add blocks to the block directory of the project.

1. Go to the [milo block library](https://github.com/adobecom/milo/tree/stage/libs/blocks) and copy the code of the block directory you are looking for
2. Create a new directory within `/blocks` and name it after a similar name of the block you are trying to add from the milo library, example: `/card -> /cards`
3. Then create a JS and a CSS file and give them the same name as the block directory you just created and paste in the code which you copied from the milo block you are trying to add into the respective files.
4. If the JS block code has imports like this example (card.js):

   ```sh
   import { decorateButtons } from '../../utils/decorate.js';
   import { loadStyle, getConfig } from '../../utils/utils.js';
   ```
   these imports won't work because /utils and utils.js are not in this project, so you will add these:

   ```sh
   import { getLibs } from '../../scripts/scripts.js'; //always add this import!!!!!

   const miloLibs = getLibs(); //always add this const!!!

   const { loadStyle, getConfig } = await import(`${miloLibs}/utils/utils.js`);
   const { decorateButtons } = await import(`${miloLibs}/utils/decorate.js`);
   ```
   The `const { loadStyle, getConfig }` is created to substitute one of the two old imports and gets dynamically imported into the code, the same goes for `import { decorateButtons } from '../../utils/decorate.js';`

   Also pay good attention to the paths in the imports of the original file so you write it down correctly when you have the new imports like `const { decorateButtons } = await import(`${miloLibs}/utils/decorate.js`);`, utils/decorate.js is where it gets the function from which needs to be imported.

## Pull requests

Make sure that you provide the correct URL for testing when you run PSI checks.
When aem-psi-checks provides you with example: `https://fix-cards--lehre-site--berufsbildung-basel.hlx.page/` make sure to change `.hlx`to `.aem`.
