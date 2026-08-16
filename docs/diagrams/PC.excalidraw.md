---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
Called four times, all from the
generator: once for the starting
position with nothing else, once for
the position being expanded (A1) with
the opening details and the move
history, and once each for the
position after White's move and after
Black's move (A4) with the history
but no opening details. ^RYs2zQPC

So most rows are created with no ECO
and no opening name. A row only picks
those up later, if that same position
is itself taken off the queue and
expanded. ^P4hzllHK

The opening details come from the
Masters reply in F. On a cache hit F
rebuilds without them, so a position
whose human data is already cached
can never be named at all. ^noNZCpM4

Names are written once and never
revised: the update only runs when
the stored row has no opening name
yet. A later, better name from a
different move order is ignored. ^ocdKc6to

Wikibooks is asked only while creating
a row, or while adding a name to a row
that had none. A row that already has
a name but no text will never be asked
again. ^G7o7X9BR

The Wikibooks step builds a page
address out of the moves played and
asks for that page. Anything going
wrong - no such page, a failed
request, or a page shorter than 50
characters - simply returns nothing,
silently, and the flow continues. ^RncuHTMO

PC.01 · Get or create
the cached record
for this position. ^rCvziX3n

PC.02 · Normalise the
position (FEN). ^K3vM3i5m

PC.03 · Does a
PositionCache row
already exist for
this position? ^IuJpV5Zz

PC.04 · Do we have
move history? ^ZDgnIzv3

no ^9w6Vd81u

PC.05 · Ask Wikibooks
for opening text
using the move history. ^RoX5ShAf

yes ^LWUk3wil

PC.06 · Create the
PositionCache row with:
• normalised FEN
• ECO, if supplied
• opening name, if supplied
• Wikibooks text, if found ^6iBNg2Zm

no ^kbG6hvvC

PC.07 · Do we have
opening metadata with
a name, while the
cached row has no
opening name yet? ^JQw1CLtF

yes ^GcNkZMsN

PC.08 · Return the
existing PositionCache
row unchanged. ^xl2Ypnr6

no ^ZVID1BQ9

yes ^47AK1dpI

PC.09 · Is Wikibooks
text missing, and do
we have move history? ^utAcaOyQ

yes ^lKoU60jW

PC.10 · Ask Wikibooks
for opening text
using the move history. ^35clA9C6

PC.11 · Update the
existing PositionCache
row with:
• ECO
• opening name
• Wikibooks text
  already stored or
  newly found ^98vo1M0m

no ^7MW2HjBm

PC.12 · Return the
updated PositionCache
row. ^kJRq7kWD

PC.13 · Return the new
PositionCache row. ^8g5amvNZ

s2 ^A5SkXsGp

I don't understand this ^1aJN3de5

c2 ^HM6x5wxV

this looks wrong to me ^4OB8SJNV

f3 ^1fXyGKqw

v3 ^bFdrhWFe

database ^wMEa3NLT

API ^Nvg3zBM4

z2 ^DF8qhOvL

note ^JM1nCFAL

g1 ^TCOzQx5Q

loop back ^mxvZqrkl

## Drawing
```json
{
	"type": "excalidraw",
	"version": 2,
	"source": "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.26.4",
	"elements": [
		{
			"id": "FEsSBxnfWcDzZIi5ZElt6",
			"type": "rectangle",
			"x": 640,
			"y": 260,
			"width": 540,
			"height": 265,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#b2f2bb",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a000",
			"roundness": null,
			"seed": 181821035,
			"version": 1,
			"versionNonce": 389617542,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "RYs2zQPC"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "RYs2zQPC",
			"type": "text",
			"x": 655,
			"y": 280,
			"width": 407,
			"height": 225,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a001",
			"roundness": null,
			"seed": 809995366,
			"version": 1,
			"versionNonce": 639858028,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "Called four times, all from the\ngenerator: once for the starting\nposition with nothing else, once for\nthe position being expanded (A1) with\nthe opening details and the move\nhistory, and once each for the\nposition after White's move and after\nBlack's move (A4) with the history\nbut no opening details.",
			"rawText": "Called four times, all from the\ngenerator: once for the starting\nposition with nothing else, once for\nthe position being expanded (A1) with\nthe opening details and the move\nhistory, and once each for the\nposition after White's move and after\nBlack's move (A4) with the history\nbut no opening details.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "FEsSBxnfWcDzZIi5ZElt6",
			"originalText": "Called four times, all from the\ngenerator: once for the starting\nposition with nothing else, once for\nthe position being expanded (A1) with\nthe opening details and the move\nhistory, and once each for the\nposition after White's move and after\nBlack's move (A4) with the history\nbut no opening details.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "6pCg91dhIu1Cczuu81cAG",
			"type": "rectangle",
			"x": 640,
			"y": 600,
			"width": 540,
			"height": 165,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a002",
			"roundness": null,
			"seed": 1499322462,
			"version": 1,
			"versionNonce": 711278107,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "P4hzllHK"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "P4hzllHK",
			"type": "text",
			"x": 655,
			"y": 620,
			"width": 407,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a003",
			"roundness": null,
			"seed": 1919377919,
			"version": 1,
			"versionNonce": 132832925,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "So most rows are created with no ECO\nand no opening name. A row only picks\nthose up later, if that same position\nis itself taken off the queue and\nexpanded.",
			"rawText": "So most rows are created with no ECO\nand no opening name. A row only picks\nthose up later, if that same position\nis itself taken off the queue and\nexpanded.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "6pCg91dhIu1Cczuu81cAG",
			"originalText": "So most rows are created with no ECO\nand no opening name. A row only picks\nthose up later, if that same position\nis itself taken off the queue and\nexpanded.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "thGwzkUX0gmoanjeuofy8",
			"type": "rectangle",
			"x": 640,
			"y": 820,
			"width": 540,
			"height": 165,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a004",
			"roundness": null,
			"seed": 302412710,
			"version": 1,
			"versionNonce": 2033666862,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "noNZCpM4"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "noNZCpM4",
			"type": "text",
			"x": 655,
			"y": 840,
			"width": 396,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a005",
			"roundness": null,
			"seed": 281749705,
			"version": 1,
			"versionNonce": 133874978,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "The opening details come from the\nMasters reply in F. On a cache hit F\nrebuilds without them, so a position\nwhose human data is already cached\ncan never be named at all.",
			"rawText": "The opening details come from the\nMasters reply in F. On a cache hit F\nrebuilds without them, so a position\nwhose human data is already cached\ncan never be named at all.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "thGwzkUX0gmoanjeuofy8",
			"originalText": "The opening details come from the\nMasters reply in F. On a cache hit F\nrebuilds without them, so a position\nwhose human data is already cached\ncan never be named at all.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "iYliHh52agJidMoIjq7Tr",
			"type": "rectangle",
			"x": -1900,
			"y": 1160,
			"width": 560,
			"height": 165,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a006",
			"roundness": null,
			"seed": 807871212,
			"version": 1,
			"versionNonce": 1522602810,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ocdKc6to"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "ocdKc6to",
			"type": "text",
			"x": -1885,
			"y": 1180,
			"width": 374,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a007",
			"roundness": null,
			"seed": 1984725799,
			"version": 1,
			"versionNonce": 1520856950,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "Names are written once and never\nrevised: the update only runs when\nthe stored row has no opening name\nyet. A later, better name from a\ndifferent move order is ignored.",
			"rawText": "Names are written once and never\nrevised: the update only runs when\nthe stored row has no opening name\nyet. A later, better name from a\ndifferent move order is ignored.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "iYliHh52agJidMoIjq7Tr",
			"originalText": "Names are written once and never\nrevised: the update only runs when\nthe stored row has no opening name\nyet. A later, better name from a\ndifferent move order is ignored.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "txaXXd2AbPlvXnHLP5oeA",
			"type": "rectangle",
			"x": -1900,
			"y": 1420,
			"width": 560,
			"height": 165,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a008",
			"roundness": null,
			"seed": 1149220567,
			"version": 1,
			"versionNonce": 1058111881,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "G7o7X9BR"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "G7o7X9BR",
			"type": "text",
			"x": -1885,
			"y": 1440,
			"width": 418,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a009",
			"roundness": null,
			"seed": 2107063910,
			"version": 1,
			"versionNonce": 2008127880,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "Wikibooks is asked only while creating\na row, or while adding a name to a row\nthat had none. A row that already has\na name but no text will never be asked\nagain.",
			"rawText": "Wikibooks is asked only while creating\na row, or while adding a name to a row\nthat had none. A row that already has\na name but no text will never be asked\nagain.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "txaXXd2AbPlvXnHLP5oeA",
			"originalText": "Wikibooks is asked only while creating\na row, or while adding a name to a row\nthat had none. A row that already has\na name but no text will never be asked\nagain.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "gWoMtTHeYiU2if6zWP3JP",
			"type": "rectangle",
			"x": -1900,
			"y": 1690,
			"width": 560,
			"height": 215,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#b2f2bb",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a010",
			"roundness": null,
			"seed": 1308940370,
			"version": 1,
			"versionNonce": 1839616449,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "RncuHTMO"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "RncuHTMO",
			"type": "text",
			"x": -1885,
			"y": 1710,
			"width": 396,
			"height": 175,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a011",
			"roundness": null,
			"seed": 351865894,
			"version": 1,
			"versionNonce": 1036345441,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "The Wikibooks step builds a page\naddress out of the moves played and\nasks for that page. Anything going\nwrong - no such page, a failed\nrequest, or a page shorter than 50\ncharacters - simply returns nothing,\nsilently, and the flow continues.",
			"rawText": "The Wikibooks step builds a page\naddress out of the moves played and\nasks for that page. Anything going\nwrong - no such page, a failed\nrequest, or a page shorter than 50\ncharacters - simply returns nothing,\nsilently, and the flow continues.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "gWoMtTHeYiU2if6zWP3JP",
			"originalText": "The Wikibooks step builds a page\naddress out of the moves played and\nasks for that page. Anything going\nwrong - no such page, a failed\nrequest, or a page shorter than 50\ncharacters - simply returns nothing,\nsilently, and the flow continues.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Fov5vLge",
			"type": "ellipse",
			"x": -93.61875697544657,
			"y": -76.09225572858543,
			"width": 205.33331298828122,
			"height": 226,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a012",
			"roundness": {
				"type": 2
			},
			"seed": 1161065550,
			"version": 162,
			"versionNonce": 1801657166,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "rCvziX3n"
				},
				{
					"id": "Zu2pPUTu",
					"type": "arrow"
				}
			],
			"updated": 1786844700535,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "rCvziX3n",
			"type": "text",
			"x": -51.54643636506269,
			"y": -37.995322002665304,
			"width": 120.99609375,
			"height": 150,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 1,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a013",
			"roundness": null,
			"seed": 1473684434,
			"version": 79,
			"versionNonce": 926843278,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844700535,
			"locked": false,
			"text": "PC.01 · Get\nor create\nthe cached\nrecord\nfor this\nposition.",
			"rawText": "PC.01 · Get or create\nthe cached record\nfor this position.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "Fov5vLge",
			"originalText": "PC.01 · Get or create\nthe cached record\nfor this position.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "yVhuWvxI",
			"type": "rectangle",
			"x": -63.33323451450906,
			"y": 242.28869665236698,
			"width": 164,
			"height": 122.66668701171875,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a014",
			"roundness": null,
			"seed": 977046354,
			"version": 49,
			"versionNonce": 1752218510,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "K3vM3i5m"
				},
				{
					"id": "vuRMbOAr",
					"type": "arrow"
				},
				{
					"id": "Zu2pPUTu",
					"type": "arrow"
				}
			],
			"updated": 1786844698437,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "K3vM3i5m",
			"type": "text",
			"x": -52.83323451450906,
			"y": 253.62204015822635,
			"width": 143,
			"height": 100,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a015",
			"roundness": null,
			"seed": 256539346,
			"version": 18,
			"versionNonce": 976099790,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844698437,
			"locked": false,
			"text": "PC.02 ·\nNormalise the\nposition\n(FEN).",
			"rawText": "PC.02 · Normalise the\nposition (FEN).",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "yVhuWvxI",
			"originalText": "PC.02 · Normalise the\nposition (FEN).",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "nBqtM8Pc",
			"type": "diamond",
			"x": -173.61880929129438,
			"y": 511.62200092134015,
			"width": 348.6666259765625,
			"height": 320,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a016",
			"roundness": null,
			"seed": 149241870,
			"version": 353,
			"versionNonce": 1249487118,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "IuJpV5Zz"
				},
				{
					"id": "vuRMbOAr",
					"type": "arrow"
				},
				{
					"id": "43O2x3uN",
					"type": "arrow"
				},
				{
					"id": "KO365n5s",
					"type": "arrow"
				},
				{
					"id": "ujww5OYV",
					"type": "arrow"
				}
			],
			"updated": 1786844696764,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "IuJpV5Zz",
			"type": "text",
			"x": -76.45215279715376,
			"y": 596.6220009213401,
			"width": 154,
			"height": 150,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a017",
			"roundness": null,
			"seed": 1552986702,
			"version": 221,
			"versionNonce": 398284622,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844696764,
			"locked": false,
			"text": "PC.03 · Does a\nPositionCache\nrow\nalready exist\nfor\nthis position?",
			"rawText": "PC.03 · Does a\nPositionCache row\nalready exist for\nthis position?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "nBqtM8Pc",
			"originalText": "PC.03 · Does a\nPositionCache row\nalready exist for\nthis position?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "vuRMbOAr",
			"type": "arrow",
			"x": 17.977294323708403,
			"y": 370.95538366408573,
			"width": 15.894585198931187,
			"height": 135.105890164973,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a018",
			"roundness": {
				"type": 2
			},
			"seed": 2071981390,
			"version": 63,
			"versionNonce": 556118030,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844698437,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-15.894585198931187,
					135.105890164973
				]
			],
			"startBinding": {
				"elementId": "yVhuWvxI",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					1
				]
			},
			"endBinding": {
				"elementId": "nBqtM8Pc",
				"mode": "orbit",
				"fixedPoint": [
					0.5019121044632576,
					0.0012578125000000996
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "Zu2pPUTu",
			"type": "arrow",
			"x": 9.69267684344668,
			"y": 155.90564944669097,
			"width": 8.366026625511918,
			"height": 80.38304720567601,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a019",
			"roundness": {
				"type": 2
			},
			"seed": 862772370,
			"version": 81,
			"versionNonce": 928194510,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844700535,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					8.366026625511918,
					80.38304720567601
				]
			],
			"startBinding": {
				"elementId": "Fov5vLge",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					1
				]
			},
			"endBinding": {
				"elementId": "yVhuWvxI",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "IIV8IICJ",
			"type": "diamond",
			"x": 271.9051513671875,
			"y": 742.7647999354771,
			"width": 279.3335309709819,
			"height": 223.33330426897328,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a020",
			"roundness": null,
			"seed": 1304877778,
			"version": 156,
			"versionNonce": 1581296398,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ZDgnIzv3"
				},
				{
					"id": "43O2x3uN",
					"type": "arrow"
				},
				{
					"id": "KO365n5s",
					"type": "arrow"
				},
				{
					"id": "rpeTD5w6",
					"type": "arrow"
				}
			],
			"updated": 1786844695672,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "ZDgnIzv3",
			"type": "text",
			"x": 356.74048723493297,
			"y": 804.5981260027204,
			"width": 109.99609375,
			"height": 100,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a021",
			"roundness": null,
			"seed": 451943374,
			"version": 91,
			"versionNonce": 1599347022,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844695672,
			"locked": false,
			"text": "PC.04 · Do\nwe have\nmove\nhistory?",
			"rawText": "PC.04 · Do we have\nmove history?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "IIV8IICJ",
			"originalText": "PC.04 · Do we have\nmove history?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "43O2x3uN",
			"type": "arrow",
			"x": 180.38501740148695,
			"y": 674.3283214889356,
			"width": 224.45349411704575,
			"height": 66.40604124054585,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a022",
			"roundness": {
				"type": 2
			},
			"seed": 1197081614,
			"version": 133,
			"versionNonce": 122575822,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "9w6Vd81u"
				}
			],
			"updated": 1786844696765,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					224.45349411704575,
					66.40604124054585
				]
			],
			"startBinding": {
				"elementId": "nBqtM8Pc",
				"mode": "orbit",
				"fixedPoint": [
					0.9987452197388419,
					0.503125
				]
			},
			"endBinding": {
				"elementId": "IIV8IICJ",
				"mode": "orbit",
				"fixedPoint": [
					0.5038607663843969,
					0.0012567567567568429
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "9w6Vd81u",
			"type": "text",
			"x": 281.61176446000985,
			"y": 695.0313421092085,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a023",
			"roundness": null,
			"seed": 1101419854,
			"version": 5,
			"versionNonce": 2043515730,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844401434,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "43O2x3uN",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "OR06pCt0",
			"type": "rectangle",
			"x": -9.61902727399547,
			"y": 1012.6698466709684,
			"width": 103.3333740234375,
			"height": 260,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a024",
			"roundness": null,
			"seed": 87713490,
			"version": 139,
			"versionNonce": 433389262,
			"isDeleted": false,
			"boundElements": [
				{
					"id": "KO365n5s",
					"type": "arrow"
				},
				{
					"type": "text",
					"id": "RoX5ShAf"
				},
				{
					"id": "Oov91KZX",
					"type": "arrow"
				}
			],
			"updated": 1786844694823,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "RoX5ShAf",
			"type": "text",
			"x": -1.9523402622767208,
			"y": 1017.6698466709684,
			"width": 88,
			"height": 250,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a025",
			"roundness": null,
			"seed": 1063645842,
			"version": 26,
			"versionNonce": 346551566,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844694823,
			"locked": false,
			"text": "PC.05 ·\nAsk\nWikibook\ns\nfor\nopening\ntext\nusing\nthe move\nhistory.",
			"rawText": "PC.05 · Ask Wikibooks\nfor opening text\nusing the move history.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "OR06pCt0",
			"originalText": "PC.05 · Ask Wikibooks\nfor opening text\nusing the move history.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "KO365n5s",
			"type": "arrow",
			"x": 267.4631963547592,
			"y": 858.5061355865772,
			"width": 204.50708747901297,
			"height": 148.16371108439114,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a026",
			"roundness": {
				"type": 2
			},
			"seed": 1083607698,
			"version": 295,
			"versionNonce": 1167891918,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "LWUk3wil"
				}
			],
			"updated": 1786844695673,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-204.50708747901297,
					148.16371108439114
				]
			],
			"startBinding": {
				"elementId": "IIV8IICJ",
				"mode": "orbit",
				"fixedPoint": [
					0.0012596519159608342,
					0.502702702702703
				]
			},
			"endBinding": {
				"elementId": "OR06pCt0",
				"mode": "orbit",
				"fixedPoint": [
					0.1390997834901669,
					0.13909978349016514
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "LWUk3wil",
			"type": "text",
			"x": 148.70965261525268,
			"y": 920.0879911287728,
			"width": 33,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a027",
			"roundness": null,
			"seed": 435649298,
			"version": 6,
			"versionNonce": 2131350670,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844412459,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "KO365n5s",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "iUsiwiMN",
			"type": "rectangle",
			"x": 335.8974562424878,
			"y": 1194.7868619087415,
			"width": 165.33331298828125,
			"height": 335,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a028",
			"roundness": null,
			"seed": 1080411918,
			"version": 29,
			"versionNonce": 406841742,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "6iBNg2Zm"
				},
				{
					"id": "Oov91KZX",
					"type": "arrow"
				},
				{
					"id": "rpeTD5w6",
					"type": "arrow"
				},
				{
					"id": "t7rpjZXW",
					"type": "arrow"
				}
			],
			"updated": 1786844921043,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "6iBNg2Zm",
			"type": "text",
			"x": 341.56411273662843,
			"y": 1199.7868619087415,
			"width": 154,
			"height": 325,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a029",
			"roundness": null,
			"seed": 2097871442,
			"version": 11,
			"versionNonce": 1139247054,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844921043,
			"locked": false,
			"text": "PC.06 · Create\nthe\nPositionCache\nrow with:\n• normalised\nFEN\n• ECO, if\nsupplied\n• opening\nname, if\nsupplied\n• Wikibooks\ntext, if found",
			"rawText": "PC.06 · Create the\nPositionCache row with:\n• normalised FEN\n• ECO, if supplied\n• opening name, if supplied\n• Wikibooks text, if found",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "iUsiwiMN",
			"originalText": "PC.06 · Create the\nPositionCache row with:\n• normalised FEN\n• ECO, if supplied\n• opening name, if supplied\n• Wikibooks text, if found",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Oov91KZX",
			"type": "arrow",
			"x": 91.71428571428578,
			"y": 1271.3364523024788,
			"width": 238.18317052820203,
			"height": 88.74827863932592,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a030",
			"roundness": {
				"type": 2
			},
			"seed": 1401817170,
			"version": 100,
			"versionNonce": 1300323854,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844921043,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					238.18317052820203,
					88.74827863932592
				]
			],
			"startBinding": {
				"elementId": "OR06pCt0",
				"mode": "inside",
				"fixedPoint": [
					0.9806445782492053,
					0.9948715601211942
				]
			},
			"endBinding": {
				"elementId": "iUsiwiMN",
				"mode": "orbit",
				"fixedPoint": [
					0,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "rpeTD5w6",
			"type": "arrow",
			"x": 549.3499464834066,
			"y": 863.9553942981483,
			"width": 55.96476500271507,
			"height": 324.8314676105931,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a031",
			"roundness": {
				"type": 2
			},
			"seed": 1111391698,
			"version": 138,
			"versionNonce": 705064014,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "kbG6hvvC"
				}
			],
			"updated": 1786844921044,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-55.96476500271507,
					324.8314676105931
				]
			],
			"startBinding": {
				"elementId": "IIV8IICJ",
				"mode": "orbit",
				"fixedPoint": [
					0.9987403480840392,
					0.5027027027027023
				]
			},
			"endBinding": {
				"elementId": "iUsiwiMN",
				"mode": "orbit",
				"fixedPoint": [
					0.9174911923057487,
					0.08250880769425083
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "kbG6hvvC",
			"type": "text",
			"x": 510.3675639820491,
			"y": 1013.871128103445,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a032",
			"roundness": null,
			"seed": 1102311438,
			"version": 5,
			"versionNonce": 2073902226,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844474581,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "rpeTD5w6",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "BOOcK62F",
			"type": "diamond",
			"x": -572.8215103920061,
			"y": 769.837525790216,
			"width": 407.27272727272685,
			"height": 398.09517996651783,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a033",
			"roundness": null,
			"seed": 1997888530,
			"version": 479,
			"versionNonce": 1904155218,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "JQw1CLtF"
				},
				{
					"id": "ujww5OYV",
					"type": "arrow"
				},
				{
					"id": "Xo5PTlH2",
					"type": "arrow"
				},
				{
					"id": "xyZLjNEp",
					"type": "arrow"
				}
			],
			"updated": 1786844672177,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "JQw1CLtF",
			"type": "text",
			"x": -462.5033285738244,
			"y": 881.3613207818454,
			"width": 187,
			"height": 175,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a034",
			"roundness": null,
			"seed": 204435278,
			"version": 263,
			"versionNonce": 1661730834,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844672177,
			"locked": false,
			"text": "PC.07 · Do we\nhave\nopening metadata\nwith\na name, while the\ncached row has no\nopening name yet?",
			"rawText": "PC.07 · Do we have\nopening metadata with\na name, while the\ncached row has no\nopening name yet?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "BOOcK62F",
			"originalText": "PC.07 · Do we have\nopening metadata with\na name, while the\ncached row has no\nopening name yet?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "ujww5OYV",
			"type": "arrow",
			"x": -163.47078177491971,
			"y": 676.5041343281623,
			"width": 184.2337883480992,
			"height": 127.19580746250097,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a035",
			"roundness": {
				"type": 2
			},
			"seed": 312960910,
			"version": 292,
			"versionNonce": 619557390,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "GcNkZMsN"
				}
			],
			"updated": 1786844696765,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-184.2337883480992,
					127.19580746250097
				]
			],
			"startBinding": {
				"elementId": "nBqtM8Pc",
				"mode": "inside",
				"fixedPoint": [
					0.02910524483939803,
					0.5152566668963192
				]
			},
			"endBinding": {
				"elementId": "BOOcK62F",
				"mode": "inside",
				"fixedPoint": [
					0.5527424872676029,
					0.08506110524446776
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "GcNkZMsN",
			"type": "text",
			"x": -272.0876759489693,
			"y": 727.6020380594128,
			"width": 33,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a036",
			"roundness": null,
			"seed": 133386510,
			"version": 6,
			"versionNonce": 937412946,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844529282,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "ujww5OYV",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "RiDa7N9b",
			"type": "ellipse",
			"x": -322.9514756416004,
			"y": 1238.5820484794406,
			"width": 226.66678292410688,
			"height": 226,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a037",
			"roundness": null,
			"seed": 1633933138,
			"version": 148,
			"versionNonce": 1029845138,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "xl2Ypnr6"
				},
				{
					"id": "Xo5PTlH2",
					"type": "arrow"
				}
			],
			"updated": 1786844655008,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "xl2Ypnr6",
			"type": "text",
			"x": -281.2568938172345,
			"y": 1276.6789822053606,
			"width": 143,
			"height": 150,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a038",
			"roundness": null,
			"seed": 322438926,
			"version": 141,
			"versionNonce": 1722961490,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844655008,
			"locked": false,
			"text": "PC.08 ·\nReturn the\nexisting\nPositionCache\nrow\nunchanged.",
			"rawText": "PC.08 · Return the\nexisting PositionCache\nrow unchanged.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "RiDa7N9b",
			"originalText": "PC.08 · Return the\nexisting PositionCache\nrow unchanged.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Xo5PTlH2",
			"type": "arrow",
			"x": -167.6441619809817,
			"y": 980.2688596540835,
			"width": 37.43940085722187,
			"height": 252.39913226958208,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a039",
			"roundness": {
				"type": 2
			},
			"seed": 383469390,
			"version": 370,
			"versionNonce": 2111087506,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ZVID1BQ9"
				}
			],
			"updated": 1786844672178,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-37.43940085722187,
					252.39913226958208
				]
			],
			"startBinding": {
				"elementId": "BOOcK62F",
				"mode": "orbit",
				"fixedPoint": [
					0.9987468354430379,
					0.5017543859649125
				]
			},
			"endBinding": {
				"elementId": "RiDa7N9b",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.10841938824376406
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "ZVID1BQ9",
			"type": "text",
			"x": -197.36386240959263,
			"y": 1093.9684257888746,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a040",
			"roundness": null,
			"seed": 1008278158,
			"version": 5,
			"versionNonce": 917473810,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844550331,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "Xo5PTlH2",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "xyZLjNEp",
			"type": "arrow",
			"x": -576.886676898647,
			"y": 974.0437154570453,
			"width": 199.66343318292718,
			"height": 194.63010241649397,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a041",
			"roundness": {
				"type": 2
			},
			"seed": 334992334,
			"version": 373,
			"versionNonce": 1333643918,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "47AK1dpI"
				}
			],
			"updated": 1786844686000,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-199.66343318292718,
					194.63010241649397
				]
			],
			"startBinding": {
				"elementId": "BOOcK62F",
				"mode": "orbit",
				"fixedPoint": [
					0.001253164556962073,
					0.5017543859649123
				]
			},
			"endBinding": {
				"elementId": "fvcV4AXg",
				"mode": "orbit",
				"fixedPoint": [
					0.5004098360655739,
					0.001255319148935996
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "47AK1dpI",
			"type": "text",
			"x": -693.2183934901105,
			"y": 1058.8587666652923,
			"width": 33,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a042",
			"roundness": null,
			"seed": 1122776530,
			"version": 6,
			"versionNonce": 1854223822,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844621196,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "xyZLjNEp",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "fvcV4AXg",
			"type": "diamond",
			"x": -940.7869153483778,
			"y": 1172.7810769899927,
			"width": 318.9610389610391,
			"height": 320,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a043",
			"roundness": null,
			"seed": 1230992526,
			"version": 220,
			"versionNonce": 2044032526,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "utAcaOyQ"
				},
				{
					"id": "xyZLjNEp",
					"type": "arrow"
				},
				{
					"id": "mSbPaw3p",
					"type": "arrow"
				},
				{
					"id": "5ZAQI98M",
					"type": "arrow"
				}
			],
			"updated": 1786844685999,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "utAcaOyQ",
			"type": "text",
			"x": -853.046655608118,
			"y": 1257.7810769899927,
			"width": 143,
			"height": 150,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a044",
			"roundness": null,
			"seed": 1014546510,
			"version": 119,
			"versionNonce": 1679262798,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844685999,
			"locked": false,
			"text": "PC.09 · Is\nWikibooks\ntext missing,\nand do\nwe have move\nhistory?",
			"rawText": "PC.09 · Is Wikibooks\ntext missing, and do\nwe have move history?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "fvcV4AXg",
			"originalText": "PC.09 · Is Wikibooks\ntext missing, and do\nwe have move history?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "mSbPaw3p",
			"type": "arrow",
			"x": -944.4471283138569,
			"y": 1338.5700285208814,
			"width": 145.0842899071365,
			"height": 182.60939613381652,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a045",
			"roundness": {
				"type": 2
			},
			"seed": 1753636174,
			"version": 145,
			"versionNonce": 2059487438,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "lKoU60jW"
				}
			],
			"updated": 1786844686000,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-145.0842899071365,
					182.60939613381652
				]
			],
			"startBinding": {
				"elementId": "fvcV4AXg",
				"mode": "orbit",
				"fixedPoint": [
					0.0012510245901640783,
					0.502127659574468
				]
			},
			"endBinding": {
				"elementId": "adKIQzv5",
				"mode": "inside",
				"fixedPoint": [
					0.7458563542898019,
					2.8432539708674135e-7
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "lKoU60jW",
			"type": "text",
			"x": -1033.489273267425,
			"y": 1417.3747265877896,
			"width": 33,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a046",
			"roundness": null,
			"seed": 185778190,
			"version": 6,
			"versionNonce": 1274939986,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844585603,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "mSbPaw3p",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "adKIQzv5",
			"type": "rectangle",
			"x": -1253.1678096006099,
			"y": 1521.1793691681921,
			"width": 219.39397638494302,
			"height": 195.15142267400574,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a047",
			"roundness": null,
			"seed": 16326098,
			"version": 39,
			"versionNonce": 663376334,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "35clA9C6"
				},
				{
					"id": "mSbPaw3p",
					"type": "arrow"
				},
				{
					"id": "vIghaXIA",
					"type": "arrow"
				}
			],
			"updated": 1786844683943,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "35clA9C6",
			"type": "text",
			"x": -1231.4708214081384,
			"y": 1556.255080505195,
			"width": 176,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a048",
			"roundness": null,
			"seed": 1249257042,
			"version": 16,
			"versionNonce": 225824210,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786855605602,
			"locked": false,
			"text": "PC.10 · Ask\nWikibooks\nfor opening text\nusing the move\nhistory.",
			"rawText": "PC.10 · Ask Wikibooks\nfor opening text\nusing the move history.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "adKIQzv5",
			"originalText": "PC.10 · Ask Wikibooks\nfor opening text\nusing the move history.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "MUGIE5HV",
			"type": "rectangle",
			"x": -660.4407112594978,
			"y": 1545.768087334791,
			"width": 218.18181818181813,
			"height": 260,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a049",
			"roundness": null,
			"seed": 1724388814,
			"version": 42,
			"versionNonce": 1385079374,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "98vo1M0m"
				},
				{
					"id": "5ZAQI98M",
					"type": "arrow"
				},
				{
					"id": "vIghaXIA",
					"type": "arrow"
				},
				{
					"id": "DiuJ43tJ",
					"type": "arrow"
				}
			],
			"updated": 1786844684999,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "98vo1M0m",
			"type": "text",
			"x": -650.3478490435887,
			"y": 1550.768087334791,
			"width": 197.99609375,
			"height": 250,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a050",
			"roundness": null,
			"seed": 1467112334,
			"version": 15,
			"versionNonce": 1566648462,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844684999,
			"locked": false,
			"text": "PC.11 · Update the\nexisting\nPositionCache\nrow with:\n• ECO\n• opening name\n• Wikibooks text\n  already stored\nor\n  newly found",
			"rawText": "PC.11 · Update the\nexisting PositionCache\nrow with:\n• ECO\n• opening name\n• Wikibooks text\n  already stored or\n  newly found",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "MUGIE5HV",
			"originalText": "PC.11 · Update the\nexisting PositionCache\nrow with:\n• ECO\n• opening name\n• Wikibooks text\n  already stored or\n  newly found",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "5ZAQI98M",
			"type": "arrow",
			"x": -621.281226713026,
			"y": 1341.7319245141102,
			"width": 22.597630708108568,
			"height": 198.03616282068083,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a051",
			"roundness": {
				"type": 2
			},
			"seed": 802385294,
			"version": 135,
			"versionNonce": 1702559502,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "7MW2HjBm"
				}
			],
			"updated": 1786844686000,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					22.597630708108568,
					198.03616282068083
				]
			],
			"startBinding": {
				"elementId": "fvcV4AXg",
				"mode": "orbit",
				"fixedPoint": [
					0.9987489754098364,
					0.502127659574468
				]
			},
			"endBinding": {
				"elementId": "MUGIE5HV",
				"mode": "orbit",
				"fixedPoint": [
					0.3312321944768775,
					0.3312321944768769
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "7MW2HjBm",
			"type": "text",
			"x": -620.9824113589717,
			"y": 1428.2500059244505,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a052",
			"roundness": null,
			"seed": 288194190,
			"version": 5,
			"versionNonce": 177858066,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844613179,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "5ZAQI98M",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "vIghaXIA",
			"type": "arrow",
			"x": -1031.3496277824281,
			"y": 1712.6944282058341,
			"width": 364.9089165229303,
			"height": 23.201728884219165,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a053",
			"roundness": {
				"type": 2
			},
			"seed": 1912311950,
			"version": 79,
			"versionNonce": 1017044238,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844685000,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					364.9089165229303,
					23.201728884219165
				]
			],
			"startBinding": {
				"elementId": "adKIQzv5",
				"mode": "inside",
				"fixedPoint": [
					1.0110495532884882,
					0.9813664507973474
				]
			},
			"endBinding": {
				"elementId": "MUGIE5HV",
				"mode": "orbit",
				"fixedPoint": [
					0.2537328108221475,
					0.7462671891778533
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "pkU29f5T",
			"type": "ellipse",
			"x": -223.73060130109684,
			"y": 1776.9370717520665,
			"width": 228.39824726055213,
			"height": 191,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a054",
			"roundness": null,
			"seed": 2125989838,
			"version": 116,
			"versionNonce": 1329879634,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "kJRq7kWD"
				},
				{
					"id": "DiuJ43tJ",
					"type": "arrow"
				}
			],
			"updated": 1786844689328,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "kJRq7kWD",
			"type": "text",
			"x": -180.78245239534988,
			"y": 1809.9083741487511,
			"width": 143,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a055",
			"roundness": null,
			"seed": 729149074,
			"version": 41,
			"versionNonce": 733960466,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844689246,
			"locked": false,
			"text": "PC.12 ·\nReturn the\nupdated\nPositionCache\nrow.",
			"rawText": "PC.12 · Return the\nupdated PositionCache\nrow.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "pkU29f5T",
			"originalText": "PC.12 · Return the\nupdated PositionCache\nrow.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "DiuJ43tJ",
			"type": "arrow",
			"x": -444.68309851091817,
			"y": 1791.8286748998953,
			"width": 225.77379264098806,
			"height": 38.51940623477003,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a056",
			"roundness": {
				"type": 2
			},
			"seed": 137321042,
			"version": 76,
			"versionNonce": 1347839698,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844689246,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					225.77379264098806,
					38.51940623477003
				]
			],
			"startBinding": {
				"elementId": "MUGIE5HV",
				"mode": "inside",
				"fixedPoint": [
					0.9888890584309902,
					0.9463868752504009
				]
			},
			"endBinding": {
				"elementId": "pkU29f5T",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.3773608635427494
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "fke6H4iR",
			"type": "ellipse",
			"x": 160.22505072984245,
			"y": 1637.9305204386606,
			"width": 195.89759239783666,
			"height": 191,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a057",
			"roundness": null,
			"seed": 1480762766,
			"version": 74,
			"versionNonce": 267801358,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "8g5amvNZ"
				},
				{
					"id": "t7rpjZXW",
					"type": "arrow"
				}
			],
			"updated": 1786844928036,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "8g5amvNZ",
			"type": "text",
			"x": 197.91358892744648,
			"y": 1670.9018228353452,
			"width": 121,
			"height": 125,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a058",
			"roundness": null,
			"seed": 1100146578,
			"version": 41,
			"versionNonce": 471122254,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844928036,
			"locked": false,
			"text": "PC.13 ·\nReturn the\nnew\nPositionCac\nhe row.",
			"rawText": "PC.13 · Return the new\nPositionCache row.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "fke6H4iR",
			"originalText": "PC.13 · Return the new\nPositionCache row.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "t7rpjZXW",
			"type": "arrow",
			"x": 362.2764892815251,
			"y": 1529.2124465203915,
			"width": 76.76457324100357,
			"height": 106.2911732550715,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "transparent",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a059",
			"roundness": {
				"type": 2
			},
			"seed": 1232134862,
			"version": 63,
			"versionNonce": 1858824078,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786844928036,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-76.76457324100357,
					106.2911732550715
				]
			],
			"startBinding": {
				"elementId": "iUsiwiMN",
				"mode": "inside",
				"fixedPoint": [
					0.15955062269215523,
					0.9982853271989554
				]
			},
			"endBinding": {
				"elementId": "fke6H4iR",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.18533672223897518
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "vTkTsNF9h7CFU0f6dIBor",
			"type": "rectangle",
			"x": 640.2314506565233,
			"y": -80,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#a5d8ff",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a060",
			"roundness": null,
			"seed": 1588612651,
			"version": 659,
			"versionNonce": 722177131,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "A5SkXsGp"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "A5SkXsGp",
			"type": "text",
			"x": 650.8590838015273,
			"y": -69.96478168133137,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a061",
			"roundness": null,
			"seed": 1400590539,
			"version": 462,
			"versionNonce": 1716832011,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "s2",
			"rawText": "s2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "vTkTsNF9h7CFU0f6dIBor",
			"originalText": "s2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "1aJN3de5",
			"type": "text",
			"x": 699.0790148498888,
			"y": -69.07955540897137,
			"width": 253,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#a5d8ff",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a062",
			"roundness": null,
			"seed": 151846763,
			"version": 493,
			"versionNonce": 1709026731,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "I don't understand this",
			"rawText": "I don't understand this",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "I don't understand this",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "paCEnCFFkc38D7WrwvyTI",
			"type": "rectangle",
			"x": 640,
			"y": -21.916556991907783,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a063",
			"roundness": null,
			"seed": 162519563,
			"version": 692,
			"versionNonce": 1557184587,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "HM6x5wxV"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "HM6x5wxV",
			"type": "text",
			"x": 650.627633145004,
			"y": -11.881338673239156,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a064",
			"roundness": null,
			"seed": 845045931,
			"version": 445,
			"versionNonce": 889749227,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "c2",
			"rawText": "c2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "paCEnCFFkc38D7WrwvyTI",
			"originalText": "c2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "4OB8SJNV",
			"type": "text",
			"x": 705.627935325296,
			"y": -9.760788692632559,
			"width": 242,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffec99",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a065",
			"roundness": null,
			"seed": 1556288331,
			"version": 460,
			"versionNonce": 957311371,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "this looks wrong to me",
			"rawText": "this looks wrong to me",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "this looks wrong to me",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "xnA0C-i0obpzu2Fe8PHtI",
			"type": "rectangle",
			"x": 640.6594011380018,
			"y": 33.91042822192958,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#da77f2",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a066",
			"roundness": null,
			"seed": 1228435947,
			"version": 728,
			"versionNonce": 2116026411,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "1fXyGKqw"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "1fXyGKqw",
			"type": "text",
			"x": 651.2870342830058,
			"y": 43.945646540598204,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#da77f2",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a067",
			"roundness": null,
			"seed": 1221131403,
			"version": 445,
			"versionNonce": 237290187,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "f3",
			"rawText": "f3",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "xnA0C-i0obpzu2Fe8PHtI",
			"originalText": "f3",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "xBXSJVDq-OCur1ZuDVTXs",
			"type": "rectangle",
			"x": 641.8667379841572,
			"y": 91.58830670788961,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffa94d",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a068",
			"roundness": null,
			"seed": 657404715,
			"version": 785,
			"versionNonce": 1371025771,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "bFdrhWFe"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "bFdrhWFe",
			"type": "text",
			"x": 652.4943711291612,
			"y": 101.62352502655824,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffa94d",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a069",
			"roundness": null,
			"seed": 1423283659,
			"version": 454,
			"versionNonce": 975490059,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "v3",
			"rawText": "v3",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "xBXSJVDq-OCur1ZuDVTXs",
			"originalText": "v3",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "wMEa3NLT",
			"type": "text",
			"x": 700.2728835215164,
			"y": 43.711868180294914,
			"width": 88,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#da77f2",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a070",
			"roundness": null,
			"seed": 1356244075,
			"version": 467,
			"versionNonce": 728044203,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "database",
			"rawText": "database",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "database",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Nvg3zBM4",
			"type": "text",
			"x": 705.2212701202568,
			"y": 105.35500286721344,
			"width": 33,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffa94d",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a071",
			"roundness": null,
			"seed": 1392303883,
			"version": 435,
			"versionNonce": 639862091,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "API",
			"rawText": "API",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "API",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "nlcKfBvYvzTkLo7QqkXCF",
			"type": "rectangle",
			"x": 644.168450123376,
			"y": 149.8855361116773,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#b2f2bb",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a072",
			"roundness": null,
			"seed": 901957035,
			"version": 806,
			"versionNonce": 834315243,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "DF8qhOvL"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "DF8qhOvL",
			"type": "text",
			"x": 654.79608326838,
			"y": 159.92075443034594,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffa94d",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a073",
			"roundness": null,
			"seed": 542300235,
			"version": 477,
			"versionNonce": 104132235,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "z2",
			"rawText": "z2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "nlcKfBvYvzTkLo7QqkXCF",
			"originalText": "z2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "JM1nCFAL",
			"type": "text",
			"x": 703.6813114756167,
			"y": 164.313830841975,
			"width": 44,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#b2f2bb",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a074",
			"roundness": null,
			"seed": 1887934187,
			"version": 421,
			"versionNonce": 1984750891,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "note",
			"rawText": "note",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "note",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "eZfJml0cvqxsCNFkhYk3B",
			"type": "rectangle",
			"x": 642.9586882447841,
			"y": 206.70848460857292,
			"width": 43.25526629000807,
			"height": 45.07043663733725,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#fff0f6",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a075",
			"roundness": null,
			"seed": 1693155723,
			"version": 857,
			"versionNonce": 426575819,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "TCOzQx5Q"
				}
			],
			"updated": 1786668443303,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "TCOzQx5Q",
			"type": "text",
			"x": 653.586321389788,
			"y": 216.74370292724154,
			"width": 22,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#ffa94d",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a076",
			"roundness": null,
			"seed": 112793643,
			"version": 533,
			"versionNonce": 900716139,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "g1",
			"rawText": "g1",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "eZfJml0cvqxsCNFkhYk3B",
			"originalText": "g1",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "mxvZqrkl",
			"type": "text",
			"x": 698.7223077179132,
			"y": 216.4029436498979,
			"width": 99,
			"height": 25,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#fff0f6",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a077",
			"roundness": null,
			"seed": 1406851787,
			"version": 388,
			"versionNonce": 1776275723,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786668443303,
			"locked": false,
			"text": "loop back",
			"rawText": "loop back",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "top",
			"containerId": null,
			"originalText": "loop back",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		}
	],
	"appState": {
		"theme": "light",
		"viewBackgroundColor": "#ffffff",
		"currentItemStrokeColor": "#1e1e1e",
		"currentItemBackgroundColor": "transparent",
		"currentItemFillStyle": "solid",
		"currentItemStrokeWidthKey": "medium",
		"currentItemStrokeVariability": "constant",
		"currentItemStrokeStyle": "solid",
		"currentItemRoughness": 0,
		"currentItemOpacity": 100,
		"currentItemFontFamily": 8,
		"currentItemFontSize": 20,
		"currentItemTextAlign": "left",
		"currentItemStartArrowhead": null,
		"currentItemEndArrowhead": "arrow",
		"currentItemArrowType": "round",
		"currentItemFrameRole": null,
		"scrollX": 2078.727128775642,
		"scrollY": 129.88074369471207,
		"zoom": {
			"value": 0.283025
		},
		"currentItemRoundness": "sharp",
		"gridSize": 20,
		"gridStep": 5,
		"gridModeEnabled": false,
		"gridColor": {
			"Bold": "rgba(217, 217, 217, 0.5)",
			"Regular": "rgba(230, 230, 230, 0.5)"
		},
		"currentStrokeOptions": null,
		"frameRendering": {
			"enabled": true,
			"clip": true,
			"name": true,
			"outline": true,
			"markerName": true,
			"markerEnabled": true
		},
		"objectsSnapModeEnabled": false,
		"activeTool": {
			"type": "selection",
			"customType": null,
			"locked": false,
			"fromSelection": false,
			"lastActiveTool": null
		},
		"disableContextMenu": false,
		"bindingPreference": "enabled",
		"isBindingEnabled": true,
		"isMidpointSnappingEnabled": true,
		"boxSelectionMode": "contain"
	},
	"prevTextMode": "parsed",
	"files": {}
}
```
%%