# Be the CPU

A game for learning to follow code. **You are the computer**: tap the line that runs next, carry values to the variables they land in, and predict what prints, all directly on top of real C++.

Watching an animation of code teaches surprisingly little. Doing the steps yourself is what builds the mental model, so every step here is something the player has to do.

## Levels

| # | Level | Concept |
|---|-------|---------|
| 1 | Boxes | Variables hold values, not formulas |
| 2 | Workers | Functions, stack frames, pass by value |
| 3 | Links | References (`int&`) |
| 4 | Blueprints | Classes, constructors, `this`, `private`, `const` methods |
| 5 | Clones | Recursion and the call stack |

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

Deep links: `index.html#4` opens level 4, `index.html#4@8` jumps to step 8 of it.

## Adding a level

Levels live in `levels.js`. Each one is a program (`code`), the function `regions` in it, and a list of `steps`. Each step says what the player must do (`ask`), what changes in the machine (`do`), and a plain-English explanation (`say`). The format is documented at the top of that file. No animation code is needed; the engine in `game.js` renders everything from the state.
