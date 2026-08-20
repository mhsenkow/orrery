# 400 next steps toward a living planet

Written after landing slices A–E. Every item names the file or symbol it touches,
because a next step you cannot start on Monday is a wish. Numbered for citation,
grouped by the thing that has to become true, not by effort.

Nothing here is a backlog entry — `scripts/thrive.mjs` and the other generators
are untouched. This is the queue as it looks from inside the code today.

---

## A · Beings inside the simulation (1–20)

The foundation just moved. These are the cracks it exposed.

1. Serialise `ENT` in `serializeRun` — a save restores every genome and not one individual.
2. Remap `m.cell` in `changeResolution`; today a detail-level change silently orphans the whole population.
3. Assert two runs with the same seed and the same `simTick` count produce byte-identical `ENT.data`, not just a matching signature.
4. Time `agentsTick` and `fireTick` separately into `W._msAgents`, and show it beside `W._msSim` — everything below spends from that line.
5. Write down the tick budget split: perception, decision, movement, groups, settlement, fire. Discover the limit on paper, not as a stutter.
6. Delete the second and third population caps. `MAX_ENT`, `capForWorld`, the `respawnEntities` stride and the 85% floor in `topUpEntities` are four interacting limits and none is a stated design choice.
7. Make `respawnEntities` incremental. It still calls `resetMorphAtlas` and rebuilds from zero, so any long-lived individual dies to a routine event.
8. Give `agentsTick` an explicit `dtYr` argument. It currently behaves identically at 10 yr/tick and 200 yr/tick, which is wrong in both directions.
9. Move `_plumeTouched` out of module scope into `W` so two worlds in one process cannot share it.
10. Bucket rebuild (`rebuildBuckets`) is O(n) every tick over a 24 576-entry `Int32Array`; keep it dirty-flagged instead.
11. `eachNearby` walks the cell and four neighbours; add a two-ring variant behind a flag and measure what group behaviour actually needs.
12. Publish `W.beingCount` by kind each tick so overlays and the HUD stop recomputing the census.
13. `_idSeq` resets on generate now — assert it, and assert a fresh process and a second generate produce the same first id.
14. Replace the `Set` in `topUpEntities` with a reused `Uint8Array` occupancy mask.
15. Kill the remaining `Math.random` calls on the agent path; `rngOf(W, 'rngAgents')` exists and should be the only source.
16. Fork a dedicated `rngBehav` stream off `rngAgents` so adding a behaviour does not shift movement.
17. Make `presentAgents` skip beings that have not moved — it currently rewrites all 1 400 positions every frame.
18. Add a `--seed` sweep to `thrive-probe.mjs` and report the spread, not one run.
19. Assert `assertBudgets` still balances after a large fire; combustion moves carbon and nobody checks it.
20. State in code what a "tick" means to a being: at 200 yr/tick, `m.age` is not an age. Either scale it or rename it.

## B · Birth, death and turnover (21–40)

Measured: 560 alive, 560 ever seen, 0 born. Population is a rendering of a scalar field.

21. Give beings births: a `tend`/`forage` individual above an energy threshold spawns into a neighbour cell.
22. Give beings a lifespan from `TRAITS.bodyMass` via `kleiberDensity` — big animals live long, and `m.age` starts meaning something.
23. Replace `topUpEntities` with births. New beings should have parents, not free slots.
24. Record `m.parent` and expose a two-generation ancestry in Inspect.
25. Cause of death is already tracked (`m.cause`); add `burned`, `hunted`, `drowned`, `old age`.
26. Log a carcass: a dead being should raise `W.detritus` in its cell, which `ecologyTick` already reads.
27. Make death local. Today `life[c] < 0.04` kills with probability 0.12 regardless of what the being is.
28. Give a founder population a bottleneck: track `m.foundedBy` and show diversity collapsing after a crash.
29. Cap births by `carryingCapacityNPP(W, c)` so a cell cannot support more than its productivity.
30. Add a juvenile stage with a smaller sprite scale — `writeEnt` already computes scale from `plan.size`.
31. Make herd size affect birth rate; a herd of two should not breed like a herd of thirty.
32. Show population as a graph in the chronicle panel, by kind, over the run.
33. Assert a fire kills beings, and that the population recovers within N ticks.
34. Assert a population that crashes to zero on a continent recolonises from another one.
35. Give the demo world a measurable turnover target and put it in the probe: births/1000 ticks.
36. Distinguish emigration from death in the census; a being that left a cell is not a being that died.
37. Add `m.energy` and spend it on movement, so `travel` has a cost and `rest` has a reason.
38. Starvation should be gradual: energy down over several ticks, not a coin flip.
39. Let a named individual's death name the era, the way `maybeNameEra` already names climate events.
40. Write a `--census` mode in the probe that prints a life table: cohort survival by age.

## C · Perception and drives (41–60)

`behav` is one of six strings from a probability roll. There is no inside.

41. Give each being a perception step: sample its own cell and the four neighbours into a fixed-size vector.
42. Gate perception on `sensory.js` — it already decides band by band what a world delivers to an eye.
43. Score the perceived options with a utility function instead of a probability ladder in `pickBehav`.
44. Store the winning score so Inspect can say *why* a being is doing what it is doing.
45. Add hunger as a drive, fed by `m.energy`, competing with fear and with rest.
46. Add fear with a decay, so an animal that fled a fire stays skittish for a while.
47. Make `isOutNow` a drive input, not a veto — a hungry nocturnal animal should sometimes come out in daylight.
48. Give beings a one-cell memory of where food was; a forager that returns is legible.
49. Make the drive weights genomic, so selection shapes behaviour with the same machinery that shapes bodies.
50. Put the drive evaluation on `gpgpu/` if it does not fit; the shape is already solved there.
51. Read `plan.habitat` in the movement gate — a gilled plan should not cross land.
52. Read `plan.trophic` — a phototroph should not chase anything.
53. Read `plan.skeleton` and `plan.limbs` for stride; only `stride` is read today.
54. A sessile plan should not move at all. Twelve of these rules already exist as `morphMult` fitness penalties; reuse the table to gate action.
55. Show the drive vector as four bars in Inspect. A number the player can watch change is worth more than a correct number they cannot see.
56. Add a behaviour overlay: paint the dominant behaviour per cell. None of the 42 overlays currently shows what anything is doing.
57. Assert a hungry being in a productive cell chooses `forage` over `rest` more often than chance.
58. Assert fear decays: a being N ticks from any fire is no longer fleeing.
59. Cost the drive step and put it in the budget line before adding a seventh behaviour.
60. Name the behaviours in one exported table instead of string literals scattered across `pickBehav`, `localview.js` and the probe.

## D · Groups (61–80)

Alignment landed. A group still has no identity.

61. Give a herd an id, so it can persist between ticks and be referred to later.
62. Give it a leader — the individual whose heading the others weight most.
63. Give it a name, kept, so the chronicle line about it can be followed up.
64. Track herd size over time and log splits and merges.
65. Add a separation radius that scales with body size; big animals need more room.
66. Make the herd hold formation while travelling and spread while foraging.
67. Let a herd have a range, and let it return to it — migration falls out of this.
68. Make a panicked herd leave a visible trail (`noteWear` already exists and decays).
69. Cap herd size by forage availability so a herd is limited by grass, not by the neighbour scan.
70. Raise the `nF >= 8` scan cap and measure the cost, rather than living with a magic number.
71. Different alignment weights for marine and land groups — a pod is not a herd.
72. Add a schooling behaviour for kind 15 with much tighter cohesion.
73. Make the reef (kind 14) explicitly sessile so it stops appearing in group logic at all.
74. Show group membership in the local grid: same-herd animals drawn with a shared tint.
75. Add a herd overlay: paint cells by the size of the largest group in them.
76. Assert a herd survives crossing a river, and does not teleport across one.
77. Assert two herds that meet either merge or pass, and do not annihilate.
78. Let a predator's approach split a herd — the classic legible behaviour.
79. Give a group a memory of where it was attacked and let it avoid that cell.
80. Report herd count, mean size and max size in the probe, not just max.

## E · Predation (81–100)

`updateFoodWeb` is real work and entirely lineage-level: one number per lineage for the whole planet.

81. Give predation a location. `n.predation` is a scalar on a tree node with no cell.
82. Spawn predator beings from lineages whose `TRAITS.trophic` is high, the way grazers now spawn from `unlockedClass`.
83. Add a `hunt` behaviour: pick a target being in the neighbourhood and close on it.
84. Interpolate the chase between cells — `presentAgents` already does the smoothing.
85. Give the hunt an outcome: a kill, a carcass in `W.detritus`, or a failure.
86. Let failure cost the predator energy, so hunting is a gamble and not a tax.
87. Feed the local kill rate back into `n.censusPop` so the lineage-level Lotka–Volterra and the visible chase are the same fact.
88. Read `TRAITS.defence` at the individual level; the herbivory arms race in `ecologyTick` currently only escalates numbers.
89. Make armoured prey slower and unarmoured prey faster, from `plan.armour`.
90. Add a predation-pressure overlay — the first overlay that shows a rate.
91. Log a notable kill in the chronicle when the prey was a named individual.
92. Let a herd's alignment reduce individual predation risk. Selfish-herd geometry is cheap and true.
93. Add scavengers that move toward `detritus`.
94. Make a predator prefer the edge of a herd over the centre.
95. Assert a predator with no prey in range starves.
96. Assert removing all predators raises the herbivore count and lowers `life`, and that it recovers.
97. Show the local food web in Inspect: what eats this, what this eats, here.
98. Give the player a "watch this animal" follow camera; `followTarget` exists and nothing follows it.
99. Report hunts attempted, hunts succeeded, and mean chase length in the probe.
100. Cost the hunt search and state it, because it is the first behaviour that is O(neighbours × beings).

## F · Fire as a system (101–120)

The front runs. It does not yet have a climate.

101. Give fire a direction from `windU/windV` instead of only a speed multiplier.
102. Add a fire season: gate ignition on `W.season` and latitude, so burns cluster in a dry half-year.
103. Add crown vs ground fire from `lifeClass` — a grassland burn and a forest burn should not look the same.
104. Add peat and soil-carbon burning: high `soil`, low `moist` should smoulder for many ticks and vent far more carbon.
105. Make fire jump narrow water — an ember-spotting probability across one cell.
106. Make fire stop dead at a river; `W.flow` is right there and unused by `fireDanger`.
107. Feed `W.ash` into albedo so a fresh burn scar is visibly darker from orbit and warms.
108. Feed smoke into `W.clouds` or a dedicated smoke field so it advects with the wind instead of diffusing isotropically.
109. Add pyrocumulus: a large enough front should seed a storm through `seedStorm`.
110. Make the burn scar a succession: pioneer growth first, then the biome, over hundreds of ticks.
111. Make fire-adapted vegetation a lineage trait, so repeated burning selects for it.
112. Let settlements burn — `W.build` should drop where fire passes, and be rebuilt.
113. Let settlements *cause* fire, and let them suppress it near cities as `unlockedClass` rises.
114. Record fire return interval per cell, and show it as an overlay. That is the number ecologists actually use.
115. Log total burnt area per era into the chronicle so the ICS ribbon carries a fire history.
116. Put `W.burntArea` into the carbon budget properly and assert `assertBudgets` still closes.
117. Make dry lightning depend on `stormField` rather than the global `stormyFrac`.
118. Add a fire-danger readout to the HUD, so Strike → Ignite is a decision and not a lottery.
119. Assert a fire in a wet forest dies within a few ticks and a fire in dry scrub runs.
120. Assert two fires that meet do not double-count fuel.

## G · The colonisation front (121–140)

Settlers advance now. They advance blind.

121. Make settlers prefer coasts and river mouths; `W.flow`, `coastDist` and `harbour` in `settleCities` all exist and none is read by the movement score.
122. Give the frontier a direction, so settlement spreads as a front and not as a stain.
123. Add a carrying-capacity check before building: `carryingCapacityNPP` already exists.
124. Make terrain cost something. A settler crosses a mountain range as easily as a plain today.
125. Let ice, desert and high altitude be genuine barriers, so continents settle in a plausible order.
126. Make `W.build` decay in abandoned cells, through ruins, then rubble, then a mound.
127. Show ruins. A landscape that carries its own failures is the strongest argument the world can make about consequence.
128. Give the build rate a technology term beyond the single `unlockedClass >= 5` step.
129. Retire the single planetary ladder. `W.unlockedClass` is one integer for the whole planet, so every region is at the same stage at the same moment.
130. Make settlement raise `W.soil` and lower `life` locally — agriculture is a land-cover change.
131. Add cropland as a distinct cover, not a build scalar.
132. Feed settlement into `technoTick` energy properly, so lights and watts are one story.
133. Let settlers fell forest, which should then be flammable slash for a while.
134. Make a settler's death leave the build behind; today the settlement is the settler.
135. Assert the settled fraction grows monotonically absent disaster, and does not on the pinned Earth.
136. Assert a drowned coastal settlement (`drowned` in `settleCities`) actually loses build.
137. Report frontier length in the probe — the perimeter of the settled region.
138. Add a settlement overlay distinct from Technosphere: stage, age and growth rate.
139. Let the player place a settlement, and price it in `thermoCost`.
140. Name the first settlement on a continent and put it in the chronicle.

## H · Settlements as entities (141–160)

`settleCities` is a flood fill that rebuilds the whole list every four ticks. A town has no continuous identity.

141. Give a settlement a persistent id across scans, matched by cell proximity.
142. Give it a founding date, kept.
143. Give it a name it keeps, instead of `${stage}-${cell}`.
144. Give it a population that persists and grows, instead of being recomputed from `build` every scan.
145. Let it be founded, grow, stagnate, decline and be abandoned — five states, one field.
146. Raise the 48-settlement cap, or state why 48.
147. Raise the 40-cell flood-fill cap, or state why 40.
148. Let two settlements merge into one when their built areas touch.
149. Give settlements a trade link when they are close and both coastal; `harbour` is already computed.
150. Let a settlement's population depend on its hinterland, not only its own cell's `npp`.
151. Show settlements as labelled markers on the globe at close zoom.
152. Show a settlement's history in Inspect: founded, peak, current.
153. Make `civPop` a real sum over persistent settlements, not over a rebuilt list.
154. Let disaster kill a settlement and log it by name.
155. Assert a settlement's id survives a scan, a save and a resolution change.
156. Assert `builtFrac` and the settlement list agree.
157. Report settlement age distribution in the probe.
158. Let the player rename a settlement; it costs nothing and it is the strongest ownership hook in the app.
159. Draw a road between linked settlements. One line, enormous legibility.
160. Give settlements a memory of the disasters they survived, and show it.

## I · Night lights and the technosphere (161–180)

Lights grow now, from one global uniform.

161. Make night lights **local**. `uNight` is a single float times a night mask, so the whole dark side glows at once.
162. Pack `W.build` into a field texture channel — `uploadFieldTextures` has three RGBA textures and spare capacity.
163. Then paint lights from that channel, so a city is a point and a coast is a chain of them.
164. Give lights a colour temperature that shifts with `unlockedClass` — fire, gas, sodium, LED.
165. Add gas flares: bright, isolated, not near settlements. Instantly readable as industry.
166. Add a lit-shipping-lane term from trade links.
167. Make lights flicker out where a settlement is abandoned, on a visible timescale.
168. Feed `technoLights` from real watts rather than a `cityScalar`; `HOLOCENE_WATTS` is already the scale.
169. Add light pollution as a consequence: nocturnal beings avoid lit cells.
170. Let the player see the night side from a fixed sub-solar viewpoint — a "night watch" mode.
171. Add a lights time-lapse capture, since growth over minutes is the whole point.
172. Show total lit area in the HUD next to `meanBuild`.
173. Make `uMoon` and `uNight` compose properly; moonlight currently washes over city glow.
174. Assert lights are zero on a world with no settlements and non-zero with them.
175. Assert lights track `builtFrac` monotonically over a run.
176. Add an aurora term at high latitude scaled by `magnetosphere` — free realism on the same night pass.
177. Make thermal waste heat visible in the infrared overlay, distinct from lights.
178. Add satellite constellations as a late `unlockedClass` marker.
179. Report lit area and mean light intensity in the probe.
180. Write down what the night side is *supposed* to communicate, then check the shader does it.

## J · Marine life and the nutrient pump (181–200)

The plume writes N and P. The ocean does not yet carry it.

181. Advect `nutrientPlume` with `oceanU/oceanV`; `advectField` in `ocean.js` already does this for `nutrientP`.
182. Add a whale fall: a large marine death should sink nutrients to depth, not release them.
183. Make the plume depth-dependent — surface feeding matters because it is at the surface.
184. Add iron explicitly; the whale pump is an iron story and `nutrientN/P` cannot express it.
185. Let the bloom feed back: raised `npp` should attract more swimmers, which is a real positive loop.
186. Add a krill or forage-fish layer between `npp` and the swimmers.
187. Give swimmers a migration between feeding and breeding grounds.
188. Make reef (kind 14) grow and bleach with temperature; `reef` is a field and `ecologyTick` already accretes it.
189. Add upwelling-following behaviour; `W.upwell` exists and nothing behavioural reads it.
190. Add a coastal-shelf preference so swimmers are not uniformly distributed in the deep.
191. Let fishing pressure from settlements deplete swimmers near cities.
192. Show a plume's age in the overlay, so you can see which way the current runs.
193. Assert the plume raises `npp` in the cells it was written to, within N ticks.
194. Assert the plume decays to zero when the feeders leave.
195. Report plume mass, not just cell count, in the probe.
196. Cost the plume write; it is currently five field writes per feeder per tick.
197. Add a hypoxia consequence when a bloom is large enough — the honest other half of eutrophication.
198. Make the reef/swimmer split depend on depth and light rather than an RNG roll.
199. Draw a surfacing animation for `surface` behaviour in the local view.
200. Add sound: a distant pod, once, when the camera is near a surfacing group.

## K · Movement across the planet (201–220)

201. Add seasonal migration: a herd with a range and a season should move between two ranges.
202. Add dispersal distance as a trait, and stop treating range expansion as diffusion.
203. Make `bioTick` colonisation directional. It is a `max` over four neighbours, which produces an isotropic stain.
204. Add corridors and barriers: mountain chains, straits, ice sheets.
205. Add a founder effect at the range edge, so an expanding population loses diversity.
206. Add an invasion: a lineage that arrives from somewhere and outcompetes what was there.
207. Show a colonisation front overlay — where the range is growing, not where it is.
208. Let sea level change cut and open land bridges, and let populations notice.
209. Add rafting: rare long-distance dispersal across water.
210. Make the local grid show tracks, so movement leaves evidence.
211. Assert a herd that migrates returns to within N cells of where it started.
212. Assert a barrier actually blocks: a population on one side does not appear on the other.
213. Add altitudinal migration on a mountain, driven by `W.season`.
214. Let a fire drive a permanent range shift, not just a flee.
215. Report mean distance travelled per being per 100 ticks in the probe.
216. Interpolate long moves properly; `presentAgents` assumes one cell per step.
217. Make stride actually vary. `plan.stride` exists and the range of values in play is unknown.
218. Add a swim/walk boundary check so a land animal cannot step into the sea.
219. Add a wading tolerance so intertidal cells are passable to some kinds and not others.
220. Draw a migration path in the chronicle map view.

## L · Vegetation that is not a scalar (221–240)

221. Split `W.life` into at least canopy and ground layers; every land decision currently reads one number.
222. Give vegetation an age, so a forest and a regrowth are distinguishable.
223. Make the sprite choice in `kindForCell` read `W.biome`, which already exists with soft membership.
224. Use `biomeMix` to blend two vegetation sprites at an ecotone.
225. Add standing dead biomass as separate fuel — that is what carries a crown fire.
226. Add a seed bank so a burnt or grazed cell recovers at a rate that depends on its neighbours.
227. Make grazing reduce `life` locally. Grazers currently eat nothing.
228. Make heavy grazing convert forest to grassland, and light grazing maintain it — the bistability in `ecologyTick` is already sketched.
229. Add browse height, so a tall canopy is out of reach of a short animal.
230. Let vegetation change albedo and `moist` locally; trees making rain is already there and is the only feedback.
231. Add treeline and its migration with temperature.
232. Add phenology to the sprite, not just to `npp` — bare branches in winter.
233. Give the local grid a vegetation structure: understory, canopy, gaps.
234. Assert grazed cells have lower `life` than ungrazed ones at equal `npp`.
235. Assert a burnt cell's `life` returns to within 10% of its neighbours within N ticks.
236. Report standing biomass by biome in the probe.
237. Make the vegetation sprite scale with `life`, so a thin biosphere looks thin.
238. Add deadwood accumulation in cold biomes, which is why boreal fires are what they are.
239. Add a lignin/decay term so `detritus` behaves differently by biome.
240. State what `W.life` is in units. Everything reads it and nothing defines it.

## M · Disturbance and recovery (241–260)

241. Make every disturbance leave a dated scar the chronicle can name.
242. Add drought as a slow disturbance, from `precip` and `groundW`, and let it precede fire.
243. Add flood from `W.flow` and `lake`, with a real consequence for settlement.
244. Add windthrow from storms: `stormField` already exists and only decays `build`.
245. Add insect outbreak — a fast biomass loss that then becomes fuel.
246. Add disease in animal populations, distinct from the global `plague`.
247. Make volcanic ash fertilise on a delay, since `ash` and `nutrientP` are both already there.
248. Make tsunami inundation kill coastal beings; `tsunamiTick` runs and nothing notices.
249. Give recovery a trajectory the player can see: a graph per disturbed cell.
250. Add compound disturbance: fire after drought should be worse than either.
251. Add a resilience readout per biome and put it beside `W.resilience`.
252. Log a disturbance summary per era into the ICS ribbon.
253. Assert a disturbed cell's recovery time depends on disturbance severity.
254. Assert repeated disturbance eventually converts a biome and does not just cycle.
255. Report disturbed area by cause in the probe.
256. Give the player a "restore" verb with a real thermodynamic price.
257. Add refugia that survive a planet-wide disturbance; `declareRefuge` exists as a god tool and not as physics.
258. Make extinction local before it is global — `extinctionTick` works on lineages.
259. Show a mass-extinction event on the globe as it happens, not only in the chronicle.
260. Add a recovery ceremony — the app already has `showMoment` and this is what it is for.

## N · The grid of squares (261–280)

The local view is the one place close enough to show behaviour, and it shows state.

261. Animate beings in the local grid; the only motion today is `presentAgents` interpolating between cells.
262. Give `stampAmbientFauna` something to do besides call `stampBug`.
263. Draw a fire in the local grid — flame, smoke, and blackened ground.
264. Draw grazing: animals near vegetation, vegetation shorter where they are.
265. Draw a hunt when one is happening in the focused cell.
266. Draw settlement construction: scaffolding, then a building.
267. Draw a surfacing pod in a marine tile.
268. Show the wind direction in the tile, so smoke and dust make sense.
269. Show time of day in the tile; `isOutNow` already knows.
270. Show weather: rain, snow, fog, using fields that already exist.
271. Add a caption line that names what is happening, not what is present.
272. Let the player click a being in the local grid and follow it.
273. Show the being's drive bars in the local panel.
274. Make the tile update at a visible rate rather than a slow one.
275. Assert the local grid renders without error for every biome and every kind.
276. Add a "what changed here" diff against the last visit — `whatHappenedHere` exists in `chronicle.js`.
277. Show tracks and wear; `wearAt` is computed and barely used.
278. Draw the herd as a herd, not as N independent sprites.
279. Add a scale bar. `cellKm` exists and the tile has no sense of size.
280. Add a day/night cycle to the tile lighting.

## O · Behaviour on the globe (281–300)

281. Add a movement overlay: per-cell mean heading of the beings in it.
282. Add a density overlay by kind.
283. Add a behaviour overlay: dominant behaviour per cell.
284. Add a birth/death rate overlay — the first rate overlays in a table of 42 states.
285. Draw herd markers at medium zoom, so groups are visible before sprites resolve.
286. Draw the colonisation front as a line.
287. Draw the fire front as a line, brighter than the ash it leaves.
288. Add trails behind moving groups that fade.
289. Make sprite scale respond to camera distance so a herd does not vanish at range.
290. Cull sprites on the far hemisphere; `uploadEntities` uploads all of them.
291. Add a "show me something happening" button that flies to the most eventful cell.
292. Make `huntGlance` prefer behaviour over `life`.
293. Add a legend for the new overlays that names the mechanism, not the colour.
294. Assert every overlay in `OVERLAYS` renders for a world with no life and no settlements.
295. Assert the overlay picker order covers every registered overlay.
296. Group the overlay picker by state vs rate, and label it.
297. Add a compare mode: two overlays side by side.
298. Let an overlay be pinned while the camera moves, so a fire can be followed.
299. Report which overlays a demo needs in `thrive-demo.md` and keep it current.
300. Retire any overlay that no longer shows anything, rather than carrying 42 forever.

## P · Sound (301–320)

301. Give fire a sound that scales with front size.
302. Give a herd a sound that scales with group size.
303. Give a settlement a sound that changes with stage.
304. Make `audioUpdate` read the focused cell's behaviour, not only its fields.
305. Add a night ambience distinct from day, driven by `isOutNow`.
306. Add rain and wind from `precip` and wind speed.
307. Add a one-shot for a surfacing pod, a stampede start, a settlement founding.
308. Add a low pulse for a mass extinction.
309. Duck ambience during a ceremony moment.
310. Add a mute-per-layer control; ambient sim audio without one is a liability.
311. Assert audio never allocates in the tick path.
312. Add ocean surf near coasts, weighted by `waveHt`.
313. Make the sound of a cell audibly different between biomes.
314. Add a "listen here" mode that isolates one cell's audio.
315. Scale everything by camera distance, including silence at orbital range.
316. Add a chronicle chime when a named event is logged.
317. Add a distinct sound for the player's own acts, so intervention is audible.
318. Report the active audio sources in the debug HUD.
319. Respect `prefers-reduced-motion` for audio intensity too.
320. Write down the audio budget the way the tick budget should be written down.

## Q · Chronicle, naming and memory (321–340)

321. Log births and deaths of named individuals, not only deaths.
322. Log herd formation, splitting and naming — the hook exists and fires once per 120 ticks.
323. Log settlement founding by name and by stage transition; the stage log exists and the name does not persist.
324. Log fire ignition, peak and extinction as one linked event chain.
325. Make `causalChain` cover fire → flee → range shift.
326. Let the chronicle be filtered by kind of event.
327. Add a map view of the chronicle: where things happened.
328. Let a chronicle entry be clicked to fly the camera there.
329. Keep a per-cell event history and surface it in Inspect; `whatHappenedHere` is most of the way there.
330. Name eras from biosphere events, not only climate ones.
331. Give the player a bookmark verb tied to a chronicle entry.
332. Export the chronicle as text, which is the thing people actually share.
333. Assert the chronicle is deterministic for a fixed seed and tick count.
334. Cap chronicle growth and state the cap.
335. Give each entry a magnitude so the log can be sorted by importance.
336. Add a "story so far" summary generated from the top entries.
337. Distinguish player acts from planet acts in the log; `W.attribution` already tracks the split.
338. Log the probe's headline numbers into the chronicle at intervals, so a run carries its own measurements.
339. Add a diff between two runs of the same seed with one different act.
340. Write the chronicle into the save.

## R · Player verbs (341–360)

341. Add a Grow verb that raises `life` locally with a real price, distinct from seeding a guild.
342. Add a Cull verb for a single herd rather than a whole clade.
343. Add a Protect verb that suppresses fire and hunting in a radius, with a running cost.
344. Add a Guide verb that sets a herd's heading for a few ticks.
345. Add a Settle verb that places a settler directly.
346. Add a Firebreak verb that lowers `life` in a line — the cheapest interesting choice in the game.
347. Make Ignite draggable so a fire can be started as a line, not a point.
348. Give Ignite a wind-aware preview showing which way it will run.
349. Add a rain verb targeted at a fire; `localWeather` exists.
350. Show the forecast for every new verb through `forecastAct`; the table has entries for eleven tools out of thirty-four.
351. Price every new verb in `thermoCost`; the fallback is a silent 10.
352. Add cooldowns where they matter — `COOLDOWN_YR` has entries for a subset.
353. Add an undo for the reversible new verbs, through `beginStroke`.
354. Add a receipt for every verb; several tools issue none.
355. Assert every tool in `TOOLS` has a price, a forecast and a receipt.
356. Assert every tool either changes the world or says why it did not — Ignite does; most do not.
357. Add keyboard shortcuts consistently; fifteen of thirty-four tools have none.
358. Group the Strike desk by what it does, not by when it was written.
359. Add a tutorial card for fire, herds and settlement, in the `god/tips.js` style.
360. Let the player name what they made — a settlement, a herd, a burn scar.

## S · Cost and budget (361–380)

361. Publish the per-subsystem tick cost, not just `W._msSim`.
362. Measure the agent layer at 560, at 1 400, and at every resolution in `N_ALLOWED`.
363. State the maximum number of beings the app supports and why.
364. Move the neighbour scan to a typed-array flat loop; `eachNearby` uses a closure per being.
365. Avoid the per-being object allocation in `ENT.meta` where it can be a struct-of-arrays.
366. Batch `writePos` and the entity upload; `uploadEntities` is called twice per tick in the loop.
367. Make `settleCities` incremental instead of a full flood fill every four ticks.
368. Make `builtFrac` an incremental counter rather than a full land sweep.
369. Profile `fireTick` under a continent-scale burn and cap the front if it needs capping — visibly, in the log.
370. Cap the plume set size and log when the cap bites; silent truncation reads as coverage.
371. Add a stress scenario to the probe: worst-case fire, worst-case population, worst-case settlement.
372. Assert the tick stays under budget in that scenario, and fail the build if not.
373. Reduce the per-tick RNG draws on the agent path; the current count is unknown.
374. Cache `fireDanger` per cell per tick where it is read more than once.
375. Move `lineageAt` off the hot path or memoise it per cell per tick.
376. Skip `planOf` when the popId has not changed; it is already conditional and worth asserting.
377. Report `noteDroppedTicks` in the HUD so the player sees when the sim is losing.
378. Decide whether the sim should slow down or drop beings under load, and say which.
379. Add a low-detail agent mode for high resolutions.
380. Write the budget into `briefs/model-limits.md`, which is where the other honest numbers live.

## T · Provenance and tests (381–400)

381. Turn `thrive-probe.mjs` into the source of every measured claim, and cite it by flag in the docs.
382. Add a committed baseline for the demo world and fail on drift beyond a stated tolerance.
383. Keep `terra` bit-comparable: assert the golden hash and the calibration after every agent change.
384. Add a pinned-vs-demo contrast test so re-throttling the demo world is caught.
385. Assert `simTick` is the only place beings advance — grep-test for `agentsTick` outside `world.js`.
386. Assert no new field is added without appearing in `reallocateWorldFields` and the generate reset.
387. Assert every new `W.*` field is either serialised or explicitly documented as derived.
388. Add a save/load round-trip test that includes beings, settlements and fire.
389. Add a resolution-change round-trip test for the same three.
390. Add a two-generates-in-one-process test for every module with mutable module scope.
391. Label every tuned constant in `fire.js`, `city.js` and `agents.js` as fitted, and say what it was fitted to.
392. Move the fitted constants into one table per module so they can be swept.
393. Add a sweep mode that reports how a headline number responds to each constant.
394. State the demo's acceptance criteria as executable assertions, not prose.
395. Time the test suite and keep the beings section under a stated share of it.
396. Add a screenshot capture of each demo beat to `scripts/capture-site.mjs`.
397. Publish the probe output for a fixed seed alongside each release, so claims are checkable later.
398. Write a one-page "what is measured and what is asserted" note and keep it honest.
399. Delete any claim in the briefs that the probe now contradicts.
400. Re-run the probe against `terra` after every change to the agent layer, because the calibration Earth is the only thing keeping the rest of it honest.
