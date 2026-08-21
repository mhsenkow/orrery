# 400 next steps — the dark side of Earth

Written after landing the Evil desk. Every item names the file or symbol it
touches, because a next step you cannot start on Monday is a wish.

**Read group A first.** There are no countries. `W.polities` does not exist,
`W.owner` does not exist, no cell belongs to anyone, and `launch` in
`vr/sim/ordnance.js` picks its silo as *"the most built-up place far enough away
to be somebody else"* — a dot-product standing in for geopolitics. Nothing ever
launches at the player. Roughly 250 of the 400 items below are downstream of
those twenty, so building them in any other order means building them twice.

Second keystone: **group Q**. A missile track today is a field painted per cell
(`W.tracer`), so it reads from orbit and is blocky up close, and an interception
is a probability roll with a cosmetic flash rather than a drone that flies out and
meets the thing. Object-level rendering is the other half of "drone warfare via
something visual".

What already works, so nobody rebuilds it: flight with a real journey and a
fading track, saturating interception (`_defFatigue`), nuclear signature layered
flash → fire ring → crater → ash → fallout → EMP blackout, four hazards with
genuinely different half-lives (`vr/sim/anthro.js`), an epidemic that travels
between settlements and burns out, a moving war front, and a solar flare that
whites out the disc and drops aurora to the tropics.

---

## A · Countries (1–20) — the keystone

1. Add `W.owner` as an `Int16Array(NC)`: which polity holds each cell, `-1` for nobody. Everything in this document keys off it.
2. Create `vr/sim/polity.js` with `W.polities` — id, name, capital cell, colour, founded year, and a live cell count.
3. Grow polities from settlements: seed one per isolated cluster in `settleCities`, so countries come from where people actually are.
4. Claim cells by proximity-to-capital plus `build`, recomputed on the same cadence as `settleCities`, not every tick.
5. Draw borders: a cell whose `owner` differs from any neighbour's is a border cell. One overlay, one colour-per-polity, and the map suddenly has politics.
6. Name countries from `vr/sim/seedword.js` so the names are seed-stable and reproducible.
7. Give each polity a capital that can be destroyed, and a succession rule for when it is.
8. Merge polities when one absorbs another's last cell; log it by name in the chronicle.
9. Split a polity when its territory becomes disconnected — civil war falls out of geography.
10. Track per-polity `build`, population, watts and land area, so "strong" and "weak" are measured rather than asserted.
11. Add `polityAt(W, c)` and `capitalOf(W, id)` as the two accessors everything else uses; keep them O(1).
12. Make `richestTarget` in ordnance.js polity-aware: an enemy capital, not the globally-largest `build` cell.
13. Replace `pickLaunchSite`'s dot-product heuristic with "a silo inside the launching polity".
14. Let the player *be* a polity, chosen or founded, so "us" and "them" exist at all.
15. Add a per-polity colour into a spare field-texture channel so borders can be shaded rather than outlined.
16. Reset `W.owner` and `W.polities` in `generate` — and let the digest test in `test.mjs` catch it if you forget.
17. Serialise polities in `serializeRun`, or a save restores a world with no countries in it.
18. Remap `owner` on `changeResolution`, the same problem `m.cell` has for beings.
19. Assert borders are closed: every cell has exactly one owner or none, no cell is claimed twice.
20. Report polity count, largest share and border length in `scripts/thrive-probe.mjs`.

## B · Rivalry and diplomacy (21–40)

21. Give each pair of polities a `relation` scalar, −1 to 1, stored sparsely for pairs that have ever interacted.
22. Decay relations toward neutral, so grudges fade unless fed.
23. Make adjacency raise tension: shared borders are the oldest cause of war in the model and should be in it.
24. Add a casus belli list — a border cell taken, a strike absorbed, a resource denied — so wars have stated reasons.
25. Let `openWar` require one, and log it: *"X declares on Y over the Z valley."*
26. Add alliances: an attack on one drags in the others, which is how a border dispute becomes a world war.
27. Add non-aggression pacts with an expiry, and the option to break one at a reputation cost.
28. Add reputation: a polity that breaks pacts finds nobody will sign the next one.
29. Add trade links between polities, and make cutting them an act of war short of war.
30. Add embargo and blockade as verbs, with a measurable cost to the target's `build` growth.
31. Add a UN-ish body once several polities exist: a vote that can condemn, sanction or authorise.
32. Let treaties ban a weapon class — and let the player break the ban visibly.
33. Add proxy war: two large polities funding a front inside a third.
34. Add client states, and the moment one stops taking instruction.
35. Add refugee flows across borders and the political cost of receiving them.
36. Show relations as a matrix panel, sorted by who is about to fight whom.
37. Make the chronicle name wars rather than logging fronts: *"the Second Kel–Vex War."*
38. Add war weariness: a polity that has fought too long sues for peace on its own.
39. Add peace treaties that redraw `W.owner`, so the map remembers the war.
40. Assert a war between allies is impossible, and that a broken pact actually changes relations.

## C · Deterrence and escalation (41–60)

41. Give each polity a nuclear arsenal count, built over time from `build` and `unlockedClass`.
42. Add a public/secret split: what a rival believes you have versus what you have.
43. Add a doctrine per polity — no-first-use, launch-on-warning, massive retaliation — as an actual branch in its AI.
44. Add an escalation ladder with named rungs, and make each rung a decision rather than a slider.
45. Add early warning: a launch is *detected* some ticks before impact, which is what makes launch-on-warning terrifying.
46. Add false positives in early warning, and let a polity decide whether to believe one.
47. Add second-strike capability: submarines that survive a first strike, so a decapitation attempt can fail.
48. Add a dead-hand option that retaliates after the capital is gone.
49. Add the decision to *not* retaliate, and make the chronicle say who chose it.
50. Make deterrence measurable: log how often a launch was considered and declined.
51. Add crisis stability as a readout — how much a polity gains by striking first.
52. Add a hotline: direct communication that lowers the odds of an accidental exchange.
53. Add accidental launch as a rare event, with the recall attempt as a mechanic.
54. Add nuclear testing, its fallout, and the diplomatic cost of doing it visibly.
55. Add proliferation: arsenals spread to polities that did not build them.
56. Add disarmament treaties with verification, and cheating.
57. Add a Doomsday-clock readout driven by arsenals, relations and recent launches.
58. Show the whole exchange as a timeline afterwards, so a player can read what happened in order.
59. Assert that a launch-on-warning polity does in fact launch on warning, and a no-first-use one does not.
60. Report exchanges considered, launched, and retaliated in the probe.

## D · The arsenal (61–80)

61. Split `PROFILES` payloads by yield: tactical, strategic, city-buster, with visibly different blast radii.
62. Add a neutron-bomb variant: low blast, high `rad`, buildings standing.
63. Add a salted warhead: modest blast, enormous long-lived `rad`.
64. Add a bunker-buster: deep crater, small surface effect, destroys what is under a capital.
65. Add EMP-optimised high-altitude burst: enormous `_empUntil`, almost no ground effect.
66. Add a dirty bomb — conventional blast plus `rad`, buildable at low `unlockedClass`.
67. Add thermobaric and cluster conventional payloads with different `build`-versus-`life` ratios.
68. Add chemical payloads properly: persistent versus non-persistent agents, mapped onto `TOXIN_KEEP`.
69. Add a biological payload that seeds `disease` rather than damage.
70. Make yield a continuous parameter with a real crater-scaling law, not three tiers.
71. Add fizzle: a warhead that partly fails, scattering `rad` without a detonation.
72. Add duds, and let the enemy recover one and gain the technology.
73. Add warhead stockpile decay — arsenals need maintenance or they stop working.
74. Add plutonium/enrichment as a resource gated on `W.ore`, so arsenals have a supply chain.
75. Add reactor accidents as a separate source of `rad` from weapons.
76. Add the fuel cycle: mining tailings, enrichment, spent fuel, each with its own contamination signature.
77. Price each payload honestly in `thermoCost` — a city-buster should feel expensive.
78. Give each payload its own icon in `vr/sim/god/icons.js`; the fallback is a magnifying glass and it is silent.
79. Assert the blast-radius scaling law against its stated formula at three yields.
80. Report arsenal composition in the probe, not just a count.

## E · Missiles as objects (81–100)

81. Give a flight a real ballistic arc: altitude over time, so it can be drawn above the surface rather than on it.
82. Draw the arc as line geometry, not as `W.tracer` cells — the field is why the track is blocky up close.
83. Add a boost phase with a visible launch plume at the silo.
84. Add a midcourse phase where the warhead is small, cold and hard to see.
85. Add re-entry: brightening, heating, a visible streak in the last seconds.
86. Make MIRVs separate at the top of the arc into visibly diverging tracks.
87. Add decoys and penetration aids that draw interceptors away from the real warhead.
88. Add chaff and radar cross-section, so `stealth` becomes a modelled property rather than a constant.
89. Add depressed-trajectory launches: shorter flight, less warning, worse accuracy.
90. Add CEP — accuracy — so a warhead can miss its aim point and hit a neighbour.
91. Add fractional orbital bombardment: an arc that goes the long way round.
92. Add hypersonic glide vehicles that manoeuvre, defeating a straight-line interceptor.
93. Add cruise missiles that follow terrain, hugging `W.h` at low altitude.
94. Replace `pathTo`'s greedy walk with a real great circle; the greedy version can oscillate at seams.
95. Cache flight paths per (from, to) pair — a saturation attack recomputes the same route dozens of times.
96. Add fuel and range limits, so not every silo can reach every target.
97. Add a launch-detection event separate from arrival, feeding early warning in group C.
98. Show every flight in a small "inbound" HUD panel with time-to-impact.
99. Assert a MIRV lands the stated number of warheads and that decoys never damage anything.
100. Report mean flight time, interception rate by profile, and CEP miss distance in the probe.

## F · Air and missile defence (101–120)

101. Make an interceptor a real object with a flight of its own, launched from a defended cell toward the incoming track.
102. Give interceptors a speed and an intercept-point solution, so a fast missile can outrun a slow defence.
103. Add interceptor magazines per battery: finite, reloading, and a visible reason saturation works.
104. Replace `_defFatigue`, a global scalar, with per-battery stocks — one continent's exhaustion should not protect another.
105. Add layered defence: boost-phase, midcourse and terminal, each with its own odds.
106. Add point defence around capitals specifically, so the capital is the hard target.
107. Add radar coverage as a field, with horizon and terrain masking — defence should have blind spots.
108. Let a first strike target the radars, which is what a real first strike does.
109. Add counter-battery: destroying launchers rather than intercepting warheads.
110. Add drone interceptors that loiter, so "drones fight them off" is literal.
111. Draw the interception: a counter-track rising to meet the arc, then a burst at the meeting point.
112. Add debris from an interception that still falls, still contaminated.
113. Add fratricide: two interceptors that arrive together destroy each other.
114. Add a defence readout per polity — coverage, magazines, expected leakage.
115. Let the player build defences as a verb, with a running cost.
116. Make defence degrade under EMP and during a grid blackout — `gridDown` should mean something.
117. Add cost asymmetry: an interceptor should cost more than the missile it stops, and say so.
118. Assert an interceptor cannot hit something faster than itself.
119. Assert magazines deplete and reload on the stated timescale.
120. Report leakage rate versus salvo size — the curve is the whole story of missile defence.

## G · Drones and autonomy (121–140)

121. Make drones agents in `ENT` rather than entries in `W.flight`, so they can loiter, search and return.
122. Give a drone an endurance budget and a base to return to.
123. Add a strike drone that circles a target area waiting for something to appear.
124. Add reconnaissance drones that reveal `W.owner` and `build` in a fog-of-war layer.
125. Add loitering munitions that pick their own target within a box.
126. Add drone swarms with the alignment behaviour herds already have in `agentsTick` — the code exists.
127. Add swarm-versus-swarm engagements, resolved by numbers and attrition.
128. Add electronic warfare: jamming that severs a drone from its operator.
129. Add autonomy levels, and a chronicle line the first time a machine chooses a target itself.
130. Add operator distance: a drone flown from another continent, and what that does to how it is used.
131. Add a civilian-casualty roll on every strike, and record it — this is the number the game should not let you hide from.
132. Add counter-drone guns, nets and birds of prey as distinct answers.
133. Add drone attrition rates by environment: storms, cold, dust.
134. Let drones carry sensors rather than weapons and feed the intelligence layer.
135. Draw a drone at sprite scale, using `S.entGain` so it stays visible from orbit.
136. Add a first-person drone feed view — the local grid already renders a patch.
137. Add commercial drones that become military ones when a war starts.
138. Assert a jammed drone stops receiving orders and behaves as its fallback says.
139. Assert swarm attrition matches the stated model over many engagements.
140. Report drone sorties, losses and civilian-casualty count in the probe.

## H · War at sea (141–160)

141. Add naval units as agents that can only occupy `h < seaLevel` cells.
142. Add carriers with an aircraft radius, so power projection has a distance.
143. Add submarines with a detection probability rather than a position the enemy knows.
144. Add anti-submarine warfare, and the tension of hunting something you cannot see.
145. Make SLBM launch reveal the boat's position — the cost of firing.
146. Add sea lanes derived from coastal `build`, and make cutting them starve a polity.
147. Add choke points from geography, and let holding one be strategically decisive.
148. Add naval mines that persist long after the war, like the toxin field does.
149. Add convoys, escorts and losses per crossing.
150. Add amphibious invasion as the only way to move a front across water.
151. Add ports as high-value targets whose loss cuts supply.
152. Add oil spills from sunk tankers, feeding `pourToxin`.
153. Add sunk-wreck contamination that leaks for centuries.
154. Add fishing-fleet collapse in a contested sea, and the effect on `beingDens`.
155. Add sonar's effect on marine life — the pods in `kind 15` should scatter.
156. Add a sea-control overlay showing who can actually move where.
157. Draw wakes behind naval units the way `noteWear` draws tracks on land.
158. Assert a land unit cannot enter water and a ship cannot enter land.
159. Assert an undetected submarine is genuinely not visible to the enemy AI.
160. Report sea control, tonnage sunk and lanes cut in the probe.

## I · War on land (161–180)

161. Give `openWar`'s front a supply line back to the capital, and make it fail when cut.
162. Add attrition per tick, with casualties on both sides recorded separately.
163. Add terrain effects: mountains, rivers and marsh should slow or stop a front.
164. Add fortification as a verb, and let a dug-in defender hold against numbers.
165. Add encirclement: a front that closes behind an army destroys it.
166. Add occupation, distinct from conquest, with a garrison cost per tick.
167. Add insurgency in occupied territory, scaling with cultural distance.
168. Add partisans that cut the occupier's supply rather than fighting it.
169. Add scorched earth on retreat: burning what you cannot hold, using `igniteFire`.
170. Add minefields and unexploded ordnance that maim for decades.
171. Add siege: a surrounded city that starves, with `build` and population falling.
172. Add conscription and its effect on the population pyramid in `ENT`.
173. Add war economy: `build` diverted from growth to arsenal, visibly slowing the lights.
174. Add front-line trenches as a visible scar in the `wear` field.
175. Add prisoner and displaced-person flows.
176. Add a front-line overlay that shows movement direction, not just contested cells.
177. Add battle names in the chronicle, drawn from the nearest settlement.
178. Assert a cut supply line halts an advance within the stated number of ticks.
179. Assert an encircled force is destroyed and its cells change owner.
180. Report front length, advance rate and casualties per side in the probe.

## J · Cities under attack (181–200)

181. Give settlements a population number that dies, separately from `build` that falls.
182. Add casualties as a running total the game never lets you clear.
183. Add refugees as real agents leaving a struck cell and arriving somewhere else.
184. Make refugee arrival raise `build` demand and tension at the destination.
185. Add rubble as a distinct state between built and empty, with its own colour.
186. Add reconstruction that takes far longer than destruction, and show the asymmetry.
187. Add a shelter mechanic: warned civilians die less, which makes early warning humane rather than tactical.
188. Add firestorm in a dense city — `build` as fuel, not just `life`.
189. Add water and power failure after a strike, killing after the blast.
190. Add hospitals and their loss, so casualties compound.
191. Add a memorial: a permanently marked cell that appears in the chronicle forever.
192. Add ghost towns — settlements abandoned but not destroyed, kept as ruins.
193. Add a rebuilt-on-top-of layer, so a city has strata like the geology does.
194. Add a casualty overlay, and make it the least beautiful overlay in the game on purpose.
195. Add per-city names that persist through destruction and rebuilding.
196. Add the moment a capital falls as a full-screen chronicle event.
197. Add population pyramids per polity, and show a war in them.
198. Assert casualties are conserved: everyone who dies leaves the population count.
199. Assert reconstruction cannot outpace destruction at the stated rates.
200. Report casualties, refugees and rubble area in the probe.

## K · Nuclear aftermath (201–220)

201. Make fallout drift with `windU/windV` instead of appearing as a static ring.
202. Add a plume shape that depends on wind shear and burst height.
203. Add rainout: precipitation concentrating fallout into hotspots far downwind.
204. Add isotope classes with different half-lives, so contamination changes character over time.
205. Add bioaccumulation up the food chain, using the trophic fields already in `trophicField.js`.
206. Add contaminated agriculture: `build` that survives but cannot feed anyone.
207. Add nuclear winter properly: soot into the stratosphere, `W.gases.dust`, and a multi-year cold.
208. Add the crop-failure cascade from that cooling, and the famine that follows.
209. Add ozone destruction from a large exchange, coupling into `W.ozone` and UV.
210. Add exclusion zones the settlement AI will not enter for thousands of ticks.
211. Add wildlife return to an exclusion zone — the most interesting thing radiation does to a biosphere.
212. Add mutation pressure feeding the existing phylogeny in `vr/sim/evolve.js`.
213. Add decontamination as a slow, expensive verb.
214. Add a dose-rate readout in Inspect, in units, so the field means something.
215. Add long-term cancer mortality, delayed by decades of sim time.
216. Add the `disasterChainTick` treatment for nuclear war: a named sequence of consequences over time.
217. Extend `biosphereHolds` in `calibrate.mjs` to assert recovery after an exchange.
218. Add a "how long until this is habitable" number per contaminated cell.
219. Assert nuclear winter cools the planet by the stated amount for the stated duration.
220. Report peak dose, exclusion-zone area and time-to-habitable in the probe.

## L · Chemical, biological, radiological (221–240)

221. Split `toxin` into agent classes: nerve, blister, defoliant, each with its own persistence.
222. Add defoliant that removes `life` without killing soil, and the decades-long regrowth.
223. Add persistent agents that make ground unusable without being lethal.
224. Add protective equipment, so a prepared population suffers less.
225. Add weather dependence: agents disperse in wind and pool in valleys.
226. Add water-supply poisoning as a distinct, extremely effective attack.
227. Give `seedDisease` a proper R₀ derived from density and travel, rather than a `transmit` constant.
228. Add incubation, so an epidemic spreads before it is visible.
229. Add asymptomatic carriers moving along trade routes.
230. Add quarantine and border closure as verbs, with an economic cost.
231. Add vaccine development racing the epidemic curve.
232. Add engineered-pathogen traits: lethality, transmissibility, latency, as a design space with trade-offs.
233. Add the lab-leak path — a research programme that fails, with no attacker at all.
234. Add zoonotic spillover from `beingDens`, so wildlife contact is the origin.
235. Add antimicrobial resistance developing over long runs.
236. Add a plague-doctor-era response versus a modern one, gated on `unlockedClass`.
237. Add an epidemic-curve panel: infected, immune, dead, over time.
238. Assert quarantine measurably slows spread at the stated strength.
239. Assert a vaccine ends an epidemic faster than burnout alone.
240. Report R₀, peak prevalence and total mortality in the probe.

## M · Industrial poison (241–260)

241. Add mine tailings as a permanent `toxin` source tied to `W.ore` extraction.
242. Add smelter fallout: heavy metals downwind of industry, with no war involved.
243. Add acid rain from `sulphate`, and make it kill forests and lakes specifically.
244. Add river-borne contamination that follows `W.flow` to the sea.
245. Add groundwater contamination in `W.groundW`, invisible and slow.
246. Add ocean dead zones from agricultural `nutrientN` runoff — eutrophication is already half-modelled.
247. Add plastic accumulation in the gyres, using the ocean currents that exist.
248. Add microplastics in the food chain via `trophicField`.
249. Add forever-chemicals with a half-life longer than the game's runtime, and say so.
250. Add oil spills with a surface slick that spreads with currents.
251. Add tanker and pipeline failures as random industrial events, not player acts.
252. Add e-waste and its export from rich polities to poor ones.
253. Add landfill and leachate.
254. Add air-quality mortality in cities: the quiet killer that never makes the chronicle.
255. Add lead in the environment and its effect on the population.
256. Add industrial accidents — Bhopal-scale — as a single-cell catastrophe with no attacker.
257. Add regulation as a verb that reduces all of the above at a cost to `build` growth.
258. Add the discovery moment: contamination that existed for centuries becoming *known*.
259. Assert regulation measurably reduces contamination rates.
260. Report contaminated area by source — war versus industry — because the comparison is the point.

## N · Climate as a weapon (261–280)

261. Add deliberate stratospheric aerosol injection as a unilateral act by one polity.
262. Add termination shock when it stops, which is the actual danger.
263. Add the diplomatic crisis of one polity geoengineering for all of them.
264. Add cloud seeding and weather modification over a rival's harvest.
265. Add the ENMOD question: a treaty banning environmental warfare, and breaking it.
266. Add dam destruction as a weapon, with the flood as a real event.
267. Add deliberate deforestation to deny cover, feeding `igniteFire`.
268. Add ice-sheet destabilisation as a slow, irreversible act.
269. Add methane clathrate release as an attack, not just a feedback — `releaseClathrate` exists.
270. Add ocean iron fertilisation and its unintended dead zone.
271. Add solar-shade sabotage: an orbital mirror that fails or is destroyed.
272. Add carbon-capture infrastructure and the effect of bombing it.
273. Add climate refugees as a distinct flow from war refugees.
274. Add water wars over a shared river basin using `W.flow` catchments.
275. Add sea-level rise as a slow attack on coastal capitals.
276. Add attribution science: a panel that says how much of a disaster was somebody's fault.
277. Add the free-rider problem as an actual AI behaviour among polities.
278. Assert termination shock produces the stated rebound.
279. Assert a river-basin upstream polity can measurably harm a downstream one.
280. Report anthropogenic versus natural forcing separately in the probe.

## O · Information and infrastructure (281–300)

281. Add a cyber layer: attacks that disable `build` function without destroying it.
282. Add grid attacks that extend `_empUntil` without a warhead.
283. Add attacks on water, rail and port control systems.
284. Add a communications field, and make severing it break command and control.
285. Add propaganda that shifts a rival population's willingness to fight.
286. Add censorship and information blackouts, and what the chronicle does not get to say.
287. Add misinformation that causes a *wrong* early-warning decision.
288. Add satellite navigation, and the effect of denying it on accuracy.
289. Add undersea cable cuts as a deniable act of war.
290. Add financial attacks: a currency or market collapse hitting `build` growth.
291. Add supply-chain warfare — denying one component that everything needs.
292. Add sabotage by insiders, with no visible attacker.
293. Add attribution difficulty: an attack whose author is genuinely unknown to the player.
294. Add deniability as a mechanic, and the cost of being caught.
295. Add a cyber-defence posture and the tradeoff against openness.
296. Add a "what does the enemy believe" panel — the intelligence picture versus the truth.
297. Add fog of war over `W.owner` and arsenals, revealed by reconnaissance.
298. Assert a severed comms link measurably degrades the AI's decisions.
299. Assert an unattributed attack does not change relations with the actual author.
300. Report cyber incidents, blackout ticks and attribution accuracy in the probe.

## P · Space and orbit (301–320)

301. Add satellites as orbital objects with real periods, drawn above the globe.
302. Add reconnaissance satellites feeding the intelligence layer.
303. Add early-warning satellites, and make destroying them the opening move.
304. Add anti-satellite weapons and the debris they create.
305. Add the Kessler cascade: debris begetting debris, closing orbit for everyone.
306. Add a debris-belt visual — a ring of tracked objects around the planet.
307. Add orbital bombardment from a platform, and the treaty that forbids it.
308. Add a space station that can be destroyed or evacuated.
309. Add launch sites as ground targets, and the loss of access to orbit.
310. Add GPS denial and its effect on group E accuracy.
311. Add solar-flare damage to satellites specifically, coupling to `stellarFlare`.
312. Add re-entering debris starting fires, using `igniteFire`.
313. Add a spent-fuel-in-orbit hazard that re-enters contaminated.
314. Add asteroid redirection as a weapon, reusing `strikeImpact` with an author.
315. Add lunar and orbital mirrors as both tool and target.
316. Add an orbital-population readout and a debris-density overlay.
317. Add the moment orbit becomes unusable, as a permanent chronicle entry.
318. Assert a Kessler cascade is self-sustaining above the stated debris density.
319. Assert destroying early warning measurably shortens the defender's decision time.
320. Report satellites alive, debris count and orbital access in the probe.

## Q · Making it visual (321–340) — the other keystone

321. Draw flights as line geometry above the surface; `W.tracer` is a per-cell field and it is why tracks look blocky.
322. Add a bright moving point at the warhead, distinct from the fading trail behind it.
323. Add a launch plume at the silo, rising and dispersing over several ticks.
324. Add a re-entry streak that brightens as it descends.
325. Add a real mushroom cloud: stem, cap and a shadow, growing then drifting downwind.
326. Add a blast flash that briefly overexposes the whole frame, using the existing exposure system in `main.js`.
327. Add a shockwave ring that expands and fades across cells.
328. Add smoke columns from burning cities, advected by wind.
329. Add the fallout plume as a drawn shape rather than a symmetric ring.
330. Add tracer geometry for interceptors rising to meet an arc.
331. Add explosion sprites at intercept points, sized by what was destroyed.
332. Add a night-side view where fires and cities compete — the most striking frame the game can produce.
333. Add rubble and crater texture at close zoom in `localview.js`.
334. Add a border-glow render for contested frontiers.
335. Add unit sprites for armies, ships and drones at appropriate zoom, reusing `S.entGain`.
336. Add a time-lapse capture mode for an entire exchange.
337. Add a cinematic camera that follows a missile from launch to impact.
338. Add a colour-blind-safe palette check for every new overlay.
339. Add a screenshot test that renders each new visual once and fails on a blank frame.
340. Add a performance budget for the new geometry and state it, the way the tick budget is stated.

## R · Sound (341–360)

341. Add a launch sound with distance falloff.
342. Add a detonation with a delay proportional to distance — sound arriving after light is free drama.
343. Add air-raid sirens in threatened settlements.
344. Add the silence after an EMP, with all ambience cut.
345. Add radio chatter that stops when comms are severed.
346. Add a Geiger click that scales with local `rad`.
347. Add the drone buzz, at pitch by altitude.
348. Add distant artillery as a rumble along a front.
349. Add a low tone for the Doomsday-clock readout advancing.
350. Add crowd and evacuation sound in a struck city.
351. Add fire roar scaled to front size, extending the existing fire audio.
352. Add a sonar ping for the submarine hunt.
353. Add the interception snap, short and high.
354. Add music that thins as the biosphere thins.
355. Add a mute-per-layer control; ambient war audio without one is a liability.
356. Duck all ambience during a chronicle ceremony.
357. Add a distinct sound for the player's own acts, so responsibility is audible.
358. Respect reduced-motion and reduced-audio preferences throughout.
359. Assert audio never allocates on the tick path.
360. State the audio budget alongside the tick budget.

## S · Consequence and accounting (361–380)

361. Add a running death toll attributable to the player, always visible, never resettable.
362. Split it by cause: blast, fallout, famine, disease, war, poison.
363. Add `W.attribution` coverage for every act on the Evil desk — the field exists.
364. Add a war-crimes log: acts that a treaty forbade, listed by name and date.
365. Add a tribunal at the end of a run that reads the log back.
366. Add the counterfactual: what the planet would look like had you not acted.
367. Add a "who benefited" readout after every war.
368. Add a legacy screen thousands of ticks later, showing what is still contaminated.
369. Add named individual deaths in struck cities, using the naming machinery in `agents.js`.
370. Add survivor testimony as chronicle entries in the first person.
371. Add the moment a species goes extinct because of an act, attributed.
372. Add a per-polity history that outlives the polity.
373. Add museum and archive loss as a distinct, permanent kind of destruction.
374. Add a "this cell has been fought over N times" counter and surface it.
375. Add a recovery narrative: the chronicle noticing when a scar finally heals.
376. Add an ending condition for a planet made uninhabitable, and make it quiet rather than dramatic.
377. Add an achievement-free design note: nothing here should reward atrocity with a badge.
378. Rate-limit war logging the way settlement logging is rate-limited, or the chronicle becomes a syslog again.
379. Assert every Evil act is attributable to the actor who took it.
380. Report the full attributed death toll in `scripts/thrive-probe.mjs`.

## T · Keeping it honest (381–400)

381. Add a `scripts/dark-probe.mjs` alongside the thrive probe, measuring polities, arsenals, exchanges and casualties.
382. Add a scripted scenario runner: a fixed exchange that must produce the same outcome every run.
383. Assert every new `W` field appears in `reallocateWorldFields` and in a reset — the digest test catches leaks, use it.
384. Assert every new field is serialised or documented as derived.
385. Add a save/load round-trip test covering polities, flights, hazards and arsenals.
386. Add a resolution-change round-trip test for `W.owner`.
387. Keep `terra` bit-comparable: assert golden and calibration after every change in this document.
388. Add a pinned-versus-live contrast test for every new mechanic, as the fire and settlement ones have.
389. Label every fitted constant as fitted, and say what it was fitted to and at what resolution.
390. Move fitted constants into one table per module so they can be swept.
391. Add a sweep mode reporting how each headline number responds to each constant.
392. State the tick budget for the war layer before building it, not after.
393. Profile every new tick function and keep a clean planet free — the Evil desk manages this; keep it true.
394. Add a stress scenario: maximum polities, maximum flights, maximum contamination, and assert the budget holds.
395. Log every silent cap — top-N, sampling, truncation — because silent truncation reads as coverage.
396. Add a determinism test: same seed, same acts, same outcome, byte for byte.
397. Keep the test suite's runtime under a stated share, and split slow slices behind a flag if needed.
398. Write down what is modelled and what is a gesture, per mechanic, and keep it current.
399. Delete any claim in these briefs that a probe contradicts.
400. Re-run the biosphere guard after every change here: the whole point of a dark side is that there is a living planet to darken.
