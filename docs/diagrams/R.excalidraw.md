---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
R.01 · Start the tree
generator from the
command line. ^YxQZA7En

R.02 · Wipe the log file on the
Obsidian path and write a
fresh heading. ^uwI2QTI0

R.03 · Call createLockfile().

It first checks whether
generator.lock already exists.

If it does not exist,
write a new file containing
"locked". ^JR7cVkKR

R.04 · Print:

"Tree Generator is already
running (lockfile exists)."

Then stop the process
with exit code 1. ^D4cSujc7

R.06 · From now on,
every console.log message
is also appended to the
log file.

console.error messages
are not added to the log. ^kxIAOxHs

R.07 · Make sure the user
"Yaroslav" exists. Create it
if it does not. ^5VdcMh9V

R.08 · Make sure the repertoire
"Black Universal Repertoire"
exists. Create it if it does not. ^c84CcJJL

R.09 · Make sure the starting
position is in the position
cache. ^qGg8N4YM

R.10 · Make sure a root node
with an empty PGN/history
exists for this repertoire.

Create it with cumulative
probability 1.0 if it does not. ^93YA5Hyk

R.11 · Put the starting position
into the queue: move number 1,
trap depth 0, probability 1.0,
no moves played yet. ^ZLFEAFA9

R.12 · Start an empty list of
move sequences already
visited. ^bghtVgu0

R.13 · Everything is ready ->
A1: the main loop.

The generator is called
with maxDepth = 3. ^9ZiGJVy5

R.14 · After
generateRepertoire()
returns, or after an error
from it is caught:

• remove generator.lock,
  if it still exists
• append the closing ```
  to the log file
• disconnect Prisma ^eHCtbrG2

createLockfile throws ^PEY87y28

The log path is written into the
script: a Windows OneDrive folder
with a Russian folder name. On any
other machine, or if that folder is
gone, the run stops at R.02 before
it has done anything. ^1KUuH8Sz

R.02 happens before R.03. Starting
a second run wipes the log of the
run that is already going, then
refuses to start. The first run
keeps writing to the wiped file. ^1oMR8SbB

The lockfile is the only thing
stopping two runs at once. The
tactical sweeper (TS) checks the
same file, so the generator and
the sweeper can never run at the
same time. That is deliberate:
both drive the same engine. ^RKQN3fsZ

If the process is killed - window
closed, machine restarted, power
cut - R.14 never runs and the
lockfile is left behind. Every
later run then refuses to start
until it is deleted by hand. ^5xPnccro

The depth limit of 3 is written
into the start script, not chosen
in the app. Changing how deep the
tree goes means editing this file. ^8OGmLWeB

Why a queue taken from the front:
every short line is finished before
any long line is started. Stop the
run early and you have a complete
shallow book. Taken from the back,
one line would go very deep while
whole openings stayed untouched. ^H4fp2GRZ

The visited list is kept in memory
only. It empties when the run ends,
so a fresh run walks positions it
has seen before - though the caches
mean it does not re-fetch them. ^ilKIfmKr

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

no error ^5bIZPZIW

## Drawing
```json
{
	"type": "excalidraw",
	"version": 2,
	"source": "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.26.4",
	"elements": [
		{
			"id": "yEqF6bHKJaFnorCoPnOCD",
			"type": "ellipse",
			"x": -180,
			"y": 0,
			"width": 360,
			"height": 200,
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
			"index": "a000",
			"roundness": {
				"type": 2
			},
			"seed": 14857035,
			"version": 2,
			"versionNonce": 1944441362,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "YxQZA7En"
				},
				{
					"id": "EZ5RJ1cVUDA4vcQRQmjju",
					"type": "arrow"
				}
			],
			"updated": 1786851266456,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "YxQZA7En",
			"type": "text",
			"x": -115.27726748857856,
			"y": 62.289321881345245,
			"width": 230.99609375,
			"height": 75,
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
			"seed": 1482177288,
			"version": 2,
			"versionNonce": 652625618,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266556,
			"locked": false,
			"text": "R.01 · Start the tree\ngenerator from the\ncommand line.",
			"rawText": "R.01 · Start the tree\ngenerator from the\ncommand line.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "yEqF6bHKJaFnorCoPnOCD",
			"originalText": "R.01 · Start the tree\ngenerator from the\ncommand line.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "7X9uGSghJrW3taCKfyPLs",
			"type": "rectangle",
			"x": -230,
			"y": 280,
			"width": 460,
			"height": 160,
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
			"index": "a002",
			"roundness": null,
			"seed": 1465236779,
			"version": 1,
			"versionNonce": 1630546423,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "uwI2QTI0"
				},
				{
					"id": "EZ5RJ1cVUDA4vcQRQmjju",
					"type": "arrow"
				},
				{
					"id": "TaE3kwFwNp6LQ3ywWPxuZ",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "uwI2QTI0",
			"type": "text",
			"x": -170.498046875,
			"y": 322.5,
			"width": 340.99609375,
			"height": 75,
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
			"seed": 1963752598,
			"version": 1,
			"versionNonce": 1481899845,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.02 · Wipe the log file on the\nObsidian path and write a\nfresh heading.",
			"rawText": "R.02 · Wipe the log file on the\nObsidian path and write a\nfresh heading.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "7X9uGSghJrW3taCKfyPLs",
			"originalText": "R.02 · Wipe the log file on the\nObsidian path and write a\nfresh heading.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "h28UTeUaSx8CrY0PTx5Im",
			"type": "diamond",
			"x": -400,
			"y": 520,
			"width": 800,
			"height": 460,
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
			"index": "a004",
			"roundness": null,
			"seed": 835380854,
			"version": 1,
			"versionNonce": 24151899,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "JR7cVkKR"
				},
				{
					"id": "TaE3kwFwNp6LQ3ywWPxuZ",
					"type": "arrow"
				},
				{
					"id": "naYVEEDOgkgp8ngNUsAS6",
					"type": "arrow"
				},
				{
					"id": "ALdX8a0WaLySKUf8IW2sQ",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "JR7cVkKR",
			"type": "text",
			"x": -25,
			"y": 650,
			"width": 330,
			"height": 200,
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
			"seed": 728476042,
			"version": 1,
			"versionNonce": 552862987,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.03 · Call createLockfile().\n\nIt first checks whether\ngenerator.lock already exists.\n\nIf it does not exist,\nwrite a new file containing\n\"locked\".",
			"rawText": "R.03 · Call createLockfile().\n\nIt first checks whether\ngenerator.lock already exists.\n\nIf it does not exist,\nwrite a new file containing\n\"locked\".",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "h28UTeUaSx8CrY0PTx5Im",
			"originalText": "R.03 · Call createLockfile().\n\nIt first checks whether\ngenerator.lock already exists.\n\nIf it does not exist,\nwrite a new file containing\n\"locked\".",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "cr2qMygxp8EM5hJMTls4j",
			"type": "ellipse",
			"x": -960,
			"y": 540,
			"width": 560,
			"height": 340,
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
			"index": "a006",
			"roundness": {
				"type": 2
			},
			"seed": 1193350490,
			"version": 1,
			"versionNonce": 1687693407,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "D4cSujc7"
				},
				{
					"id": "naYVEEDOgkgp8ngNUsAS6",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "D4cSujc7",
			"type": "text",
			"x": -828.5,
			"y": 622.5,
			"width": 297,
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
			"index": "a007",
			"roundness": null,
			"seed": 1411238292,
			"version": 2,
			"versionNonce": 457556882,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266574,
			"locked": false,
			"text": "R.04 · Print:\n\n\"Tree Generator is already\nrunning (lockfile exists).\"\n\nThen stop the process\nwith exit code 1.",
			"rawText": "R.04 · Print:\n\n\"Tree Generator is already\nrunning (lockfile exists).\"\n\nThen stop the process\nwith exit code 1.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "cr2qMygxp8EM5hJMTls4j",
			"originalText": "R.04 · Print:\n\n\"Tree Generator is already\nrunning (lockfile exists).\"\n\nThen stop the process\nwith exit code 1.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Jw5RuUHEnPK66QiMLAJkd",
			"type": "rectangle",
			"x": -230,
			"y": 1160,
			"width": 460,
			"height": 215,
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
			"index": "a008",
			"roundness": null,
			"seed": 916221699,
			"version": 2,
			"versionNonce": 61181966,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "kxIAOxHs"
				},
				{
					"id": "t2cEUICqRAZNcRik2KRAV",
					"type": "arrow"
				},
				{
					"id": "ALdX8a0WaLySKUf8IW2sQ",
					"type": "arrow"
				}
			],
			"updated": 1786851266456,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "kxIAOxHs",
			"type": "text",
			"x": -215,
			"y": 1180,
			"width": 275,
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
			"index": "a009",
			"roundness": null,
			"seed": 1788391537,
			"version": 1,
			"versionNonce": 456134164,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.06 · From now on,\nevery console.log message\nis also appended to the\nlog file.\n\nconsole.error messages\nare not added to the log.",
			"rawText": "R.06 · From now on,\nevery console.log message\nis also appended to the\nlog file.\n\nconsole.error messages\nare not added to the log.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "Jw5RuUHEnPK66QiMLAJkd",
			"originalText": "R.06 · From now on,\nevery console.log message\nis also appended to the\nlog file.\n\nconsole.error messages\nare not added to the log.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "II7KNTqm1VDZ8hT4CTfMR",
			"type": "rectangle",
			"x": -230,
			"y": 1400,
			"width": 460,
			"height": 160,
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
			"index": "a010",
			"roundness": null,
			"seed": 747344351,
			"version": 1,
			"versionNonce": 735506502,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "5VdcMh9V"
				},
				{
					"id": "t2cEUICqRAZNcRik2KRAV",
					"type": "arrow"
				},
				{
					"id": "SQOZ11ZIi3pRBYpgbntTO",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "5VdcMh9V",
			"type": "text",
			"x": -154,
			"y": 1442.5,
			"width": 308,
			"height": 75,
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
			"seed": 446846566,
			"version": 1,
			"versionNonce": 1354941359,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.07 · Make sure the user\n\"Yaroslav\" exists. Create it\nif it does not.",
			"rawText": "R.07 · Make sure the user\n\"Yaroslav\" exists. Create it\nif it does not.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "II7KNTqm1VDZ8hT4CTfMR",
			"originalText": "R.07 · Make sure the user\n\"Yaroslav\" exists. Create it\nif it does not.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "924xld8SQ7WDQm2w09mFh",
			"type": "rectangle",
			"x": -230,
			"y": 1640,
			"width": 460,
			"height": 190,
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
			"index": "a012",
			"roundness": null,
			"seed": 1483799192,
			"version": 1,
			"versionNonce": 176235938,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "c84CcJJL"
				},
				{
					"id": "SQOZ11ZIi3pRBYpgbntTO",
					"type": "arrow"
				},
				{
					"id": "EKSXC9Xw5yrByX1vCJHDN",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "c84CcJJL",
			"type": "text",
			"x": -181.5,
			"y": 1697.5,
			"width": 363,
			"height": 75,
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
			"index": "a013",
			"roundness": null,
			"seed": 1657986178,
			"version": 1,
			"versionNonce": 1887219449,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.08 · Make sure the repertoire\n\"Black Universal Repertoire\"\nexists. Create it if it does not.",
			"rawText": "R.08 · Make sure the repertoire\n\"Black Universal Repertoire\"\nexists. Create it if it does not.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "924xld8SQ7WDQm2w09mFh",
			"originalText": "R.08 · Make sure the repertoire\n\"Black Universal Repertoire\"\nexists. Create it if it does not.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "UGjjh2Nj5Cc0VpLftl2GH",
			"type": "rectangle",
			"x": -230,
			"y": 1890,
			"width": 460,
			"height": 160,
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
			"index": "a014",
			"roundness": null,
			"seed": 240951853,
			"version": 1,
			"versionNonce": 840520749,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "qGg8N4YM"
				},
				{
					"id": "EKSXC9Xw5yrByX1vCJHDN",
					"type": "arrow"
				},
				{
					"id": "stJhsLhvGyviPJWBDDjFT",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "qGg8N4YM",
			"type": "text",
			"x": -159.498046875,
			"y": 1932.5,
			"width": 318.99609375,
			"height": 75,
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
			"seed": 1482589844,
			"version": 1,
			"versionNonce": 1871548725,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.09 · Make sure the starting\nposition is in the position\ncache.",
			"rawText": "R.09 · Make sure the starting\nposition is in the position\ncache.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "UGjjh2Nj5Cc0VpLftl2GH",
			"originalText": "R.09 · Make sure the starting\nposition is in the position\ncache.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "wRootKAFRhWblECYIzZrj",
			"type": "rectangle",
			"x": -230,
			"y": 2110,
			"width": 460,
			"height": 190,
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
			"index": "a016",
			"roundness": null,
			"seed": 1867813547,
			"version": 1,
			"versionNonce": 1042406663,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "93YA5Hyk"
				},
				{
					"id": "stJhsLhvGyviPJWBDDjFT",
					"type": "arrow"
				},
				{
					"id": "gvUyTvoiJwBzlHRdfhFMy",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "93YA5Hyk",
			"type": "text",
			"x": -215,
			"y": 2130,
			"width": 341,
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
			"seed": 1192347554,
			"version": 1,
			"versionNonce": 1078806402,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.10 · Make sure a root node\nwith an empty PGN/history\nexists for this repertoire.\n\nCreate it with cumulative\nprobability 1.0 if it does not.",
			"rawText": "R.10 · Make sure a root node\nwith an empty PGN/history\nexists for this repertoire.\n\nCreate it with cumulative\nprobability 1.0 if it does not.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "wRootKAFRhWblECYIzZrj",
			"originalText": "R.10 · Make sure a root node\nwith an empty PGN/history\nexists for this repertoire.\n\nCreate it with cumulative\nprobability 1.0 if it does not.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "5i5SJSTFn1U2qEqOUDVQ6",
			"type": "rectangle",
			"x": -230,
			"y": 2360,
			"width": 460,
			"height": 220,
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
			"roundness": null,
			"seed": 1014482402,
			"version": 2,
			"versionNonce": 524664786,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ZLFEAFA9"
				},
				{
					"id": "gvUyTvoiJwBzlHRdfhFMy",
					"type": "arrow"
				},
				{
					"id": "0HLQn523GMM5AG1Ep5qVQ",
					"type": "arrow"
				}
			],
			"updated": 1786851266456,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "ZLFEAFA9",
			"type": "text",
			"x": -175.998046875,
			"y": 2420,
			"width": 351.99609375,
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
			"index": "a019",
			"roundness": null,
			"seed": 149734047,
			"version": 1,
			"versionNonce": 1696433833,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.11 · Put the starting position\ninto the queue: move number 1,\ntrap depth 0, probability 1.0,\nno moves played yet.",
			"rawText": "R.11 · Put the starting position\ninto the queue: move number 1,\ntrap depth 0, probability 1.0,\nno moves played yet.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "5i5SJSTFn1U2qEqOUDVQ6",
			"originalText": "R.11 · Put the starting position\ninto the queue: move number 1,\ntrap depth 0, probability 1.0,\nno moves played yet.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "Eyj6bTQjqCud5K7Y1YEsm",
			"type": "rectangle",
			"x": -230,
			"y": 2640,
			"width": 460,
			"height": 160,
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
			"seed": 1013375480,
			"version": 1,
			"versionNonce": 1485701136,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "bghtVgu0"
				},
				{
					"id": "0HLQn523GMM5AG1Ep5qVQ",
					"type": "arrow"
				},
				{
					"id": "OdFVAkEkEUn5dXVoLKUdO",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "bghtVgu0",
			"type": "text",
			"x": -159.498046875,
			"y": 2682.5,
			"width": 318.99609375,
			"height": 75,
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
			"seed": 847556447,
			"version": 1,
			"versionNonce": 1103810583,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.12 · Start an empty list of\nmove sequences already\nvisited.",
			"rawText": "R.12 · Start an empty list of\nmove sequences already\nvisited.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "Eyj6bTQjqCud5K7Y1YEsm",
			"originalText": "R.12 · Start an empty list of\nmove sequences already\nvisited.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "JswFy23ASuoMyIAWVrQgo",
			"type": "ellipse",
			"x": -250,
			"y": 2860,
			"width": 600,
			"height": 300,
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
			"seed": 1250723447,
			"version": 1,
			"versionNonce": 1853045116,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "9ZiGJVy5"
				},
				{
					"id": "OdFVAkEkEUn5dXVoLKUdO",
					"type": "arrow"
				},
				{
					"id": "Pl9qehtoA77faNSAwv4HV",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "9ZiGJVy5",
			"type": "text",
			"x": -109.5,
			"y": 2947.5,
			"width": 319,
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
			"index": "a023",
			"roundness": null,
			"seed": 1354810002,
			"version": 2,
			"versionNonce": 1626836818,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266595,
			"locked": false,
			"text": "R.13 · Everything is ready ->\nA1: the main loop.\n\nThe generator is called\nwith maxDepth = 3.",
			"rawText": "R.13 · Everything is ready ->\nA1: the main loop.\n\nThe generator is called\nwith maxDepth = 3.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "JswFy23ASuoMyIAWVrQgo",
			"originalText": "R.13 · Everything is ready ->\nA1: the main loop.\n\nThe generator is called\nwith maxDepth = 3.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "0ZyJe4MBv7kmdvmu28J1N",
			"type": "rectangle",
			"x": -230,
			"y": 3140,
			"width": 460,
			"height": 290,
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
			"seed": 1904022541,
			"version": 1,
			"versionNonce": 115503978,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "eHCtbrG2"
				},
				{
					"id": "Pl9qehtoA77faNSAwv4HV",
					"type": "arrow"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "eHCtbrG2",
			"type": "text",
			"x": -215,
			"y": 3160,
			"width": 286,
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
			"seed": 523234310,
			"version": 1,
			"versionNonce": 1930149963,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "R.14 · After\ngenerateRepertoire()\nreturns, or after an error\nfrom it is caught:\n\n• remove generator.lock,\n  if it still exists\n• append the closing ```\n  to the log file\n• disconnect Prisma",
			"rawText": "R.14 · After\ngenerateRepertoire()\nreturns, or after an error\nfrom it is caught:\n\n• remove generator.lock,\n  if it still exists\n• append the closing ```\n  to the log file\n• disconnect Prisma",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "0ZyJe4MBv7kmdvmu28J1N",
			"originalText": "R.14 · After\ngenerateRepertoire()\nreturns, or after an error\nfrom it is caught:\n\n• remove generator.lock,\n  if it still exists\n• append the closing ```\n  to the log file\n• disconnect Prisma",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "EZ5RJ1cVUDA4vcQRQmjju",
			"type": "arrow",
			"x": 0.03637496237707542,
			"y": 205.99999797299375,
			"width": 0.004249575169167109,
			"height": 68.00000202700625,
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
			"seed": 1638229744,
			"version": 2,
			"versionNonce": 735681682,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266557,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0.004249575169167109,
					68.00000202700625
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "yEqF6bHKJaFnorCoPnOCD",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					1
				]
			},
			"endBinding": {
				"elementId": "7X9uGSghJrW3taCKfyPLs",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "TaE3kwFwNp6LQ3ywWPxuZ",
			"type": "arrow",
			"x": 0.5574441427426837,
			"y": 446.00000000000006,
			"width": 0.406895043493375,
			"height": 68.40258551550329,
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
			"roundness": {
				"type": 2
			},
			"seed": 738437955,
			"version": 2,
			"versionNonce": 1801206354,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266560,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0.406895043493375,
					68.40258551550329
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "7X9uGSghJrW3taCKfyPLs",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "h28UTeUaSx8CrY0PTx5Im",
				"mode": "orbit",
				"fixedPoint": [
					0.5019230769230769,
					0.0012578125000000996
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "naYVEEDOgkgp8ngNUsAS6",
			"type": "arrow",
			"x": -265.29917459384853,
			"y": 681.7827040138254,
			"width": 208.7064914955891,
			"height": 27.446981412731247,
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
			"roundness": {
				"type": 2
			},
			"seed": 545282479,
			"version": 3,
			"versionNonce": 1682251794,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "PEY87y28"
				}
			],
			"updated": 1786851266573,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					-208.7064914955891,
					27.446981412731247
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "h28UTeUaSx8CrY0PTx5Im",
				"mode": "orbit",
				"fixedPoint": [
					0.0012548076923077536,
					0.5031250000000004
				]
			},
			"endBinding": {
				"elementId": "cr2qMygxp8EM5hJMTls4j",
				"mode": "orbit",
				"fixedPoint": [
					1,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "PEY87y28",
			"type": "text",
			"x": -386.15242034164305,
			"y": 683.0061947201912,
			"width": 231,
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
			"index": "a029",
			"roundness": null,
			"seed": 2077967017,
			"version": 1,
			"versionNonce": 317012289,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "createLockfile throws",
			"rawText": "createLockfile throws",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "naYVEEDOgkgp8ngNUsAS6",
			"originalText": "createLockfile throws",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "t2cEUICqRAZNcRik2KRAV",
			"type": "arrow",
			"x": 0.04599999999999226,
			"y": 1325.9999999999998,
			"width": 0,
			"height": 68.00000000000023,
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
			"seed": 1836909380,
			"version": 2,
			"versionNonce": 1175684882,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266578,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					68.00000000000023
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "Jw5RuUHEnPK66QiMLAJkd",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "II7KNTqm1VDZ8hT4CTfMR",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "SQOZ11ZIi3pRBYpgbntTO",
			"type": "arrow",
			"x": 0.04599999999999226,
			"y": 1566,
			"width": 0,
			"height": 68,
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
			"seed": 2067660449,
			"version": 2,
			"versionNonce": 737465554,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266582,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					68
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "II7KNTqm1VDZ8hT4CTfMR",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "924xld8SQ7WDQm2w09mFh",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "EKSXC9Xw5yrByX1vCJHDN",
			"type": "arrow",
			"x": 0.045999999999992276,
			"y": 1836,
			"width": 0,
			"height": 48.00000000000023,
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
			"roundness": {
				"type": 2
			},
			"seed": 323518388,
			"version": 2,
			"versionNonce": 1810262674,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266585,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					48.00000000000023
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "924xld8SQ7WDQm2w09mFh",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "UGjjh2Nj5Cc0VpLftl2GH",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "stJhsLhvGyviPJWBDDjFT",
			"type": "arrow",
			"x": 0.04599999999999227,
			"y": 2055.9999999999995,
			"width": 0,
			"height": 48.000000000000455,
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
			"roundness": {
				"type": 2
			},
			"seed": 1996339966,
			"version": 2,
			"versionNonce": 1822378066,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266588,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					48.000000000000455
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "UGjjh2Nj5Cc0VpLftl2GH",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "wRootKAFRhWblECYIzZrj",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "gvUyTvoiJwBzlHRdfhFMy",
			"type": "arrow",
			"x": 0.04599999999999226,
			"y": 2306,
			"width": 0,
			"height": 48.000000000000455,
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
			"roundness": {
				"type": 2
			},
			"seed": 2053499435,
			"version": 2,
			"versionNonce": 636907026,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266591,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					48.000000000000455
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "wRootKAFRhWblECYIzZrj",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "5i5SJSTFn1U2qEqOUDVQ6",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "0HLQn523GMM5AG1Ep5qVQ",
			"type": "arrow",
			"x": 0.04599999999999226,
			"y": 2586,
			"width": 0,
			"height": 48,
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
			"seed": 1334870920,
			"version": 3,
			"versionNonce": 2095242194,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266593,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0,
					48
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "5i5SJSTFn1U2qEqOUDVQ6",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "Eyj6bTQjqCud5K7Y1YEsm",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "OdFVAkEkEUn5dXVoLKUdO",
			"type": "arrow",
			"x": 0.04845696651044477,
			"y": 2806,
			"width": 0.0013715853868231306,
			"height": 48.00000219737694,
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
			"roundness": {
				"type": 2
			},
			"seed": 98661392,
			"version": 2,
			"versionNonce": 528191890,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266594,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					0.0013715853868231306,
					48.00000219737694
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "Eyj6bTQjqCud5K7Y1YEsm",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"endBinding": {
				"elementId": "JswFy23ASuoMyIAWVrQgo",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					3.307253460992466e-14
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "Pl9qehtoA77faNSAwv4HV",
			"type": "arrow",
			"x": 0.04985884184868637,
			"y": 3085.9999977999505,
			"width": 0.001129265676205131,
			"height": 48.000002200049494,
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
			"roundness": {
				"type": 2
			},
			"seed": 1434436182,
			"version": 2,
			"versionNonce": 363713810,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266597,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					-0.001129265676205131,
					48.000002200049494
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "JswFy23ASuoMyIAWVrQgo",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					1
				]
			},
			"endBinding": {
				"elementId": "0ZyJe4MBv7kmdvmu28J1N",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.5001
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "XAnMarFKyql1YsYypAMbj",
			"type": "rectangle",
			"x": 340,
			"y": 240,
			"width": 440,
			"height": 300,
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
			"index": "a038",
			"roundness": null,
			"seed": 234110515,
			"version": 1,
			"versionNonce": 1336443990,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "1KUuH8Sz"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "1KUuH8Sz",
			"type": "text",
			"x": 345,
			"y": 315,
			"width": 385,
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
			"index": "a039",
			"roundness": null,
			"seed": 759714065,
			"version": 2,
			"versionNonce": 1863672530,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266598,
			"locked": false,
			"text": "The log path is written into the\nscript: a Windows OneDrive folder\nwith a Russian folder name. On any\nother machine, or if that folder is\ngone, the run stops at R.02 before\nit has done anything.",
			"rawText": "The log path is written into the\nscript: a Windows OneDrive folder\nwith a Russian folder name. On any\nother machine, or if that folder is\ngone, the run stops at R.02 before\nit has done anything.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "XAnMarFKyql1YsYypAMbj",
			"originalText": "The log path is written into the\nscript: a Windows OneDrive folder\nwith a Russian folder name. On any\nother machine, or if that folder is\ngone, the run stops at R.02 before\nit has done anything.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "pYapPtY0RkCWCph0FnWQD",
			"type": "rectangle",
			"x": 340,
			"y": 580,
			"width": 440,
			"height": 260,
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
			"index": "a040",
			"roundness": null,
			"seed": 1597405429,
			"version": 1,
			"versionNonce": 859609976,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "1oMR8SbB"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "1oMR8SbB",
			"type": "text",
			"x": 345,
			"y": 647.5,
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
			"index": "a041",
			"roundness": null,
			"seed": 649689209,
			"version": 2,
			"versionNonce": 1472542866,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266598,
			"locked": false,
			"text": "R.02 happens before R.03. Starting\na second run wipes the log of the\nrun that is already going, then\nrefuses to start. The first run\nkeeps writing to the wiped file.",
			"rawText": "R.02 happens before R.03. Starting\na second run wipes the log of the\nrun that is already going, then\nrefuses to start. The first run\nkeeps writing to the wiped file.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "pYapPtY0RkCWCph0FnWQD",
			"originalText": "R.02 happens before R.03. Starting\na second run wipes the log of the\nrun that is already going, then\nrefuses to start. The first run\nkeeps writing to the wiped file.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "rwoFehYPm5hJqyhxpuBLB",
			"type": "rectangle",
			"x": 340,
			"y": 880,
			"width": 440,
			"height": 300,
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
			"index": "a042",
			"roundness": null,
			"seed": 2000953339,
			"version": 1,
			"versionNonce": 1100336804,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "RKQN3fsZ"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "RKQN3fsZ",
			"type": "text",
			"x": 345,
			"y": 942.5,
			"width": 352,
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
			"index": "a043",
			"roundness": null,
			"seed": 1274977411,
			"version": 2,
			"versionNonce": 1333024338,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266598,
			"locked": false,
			"text": "The lockfile is the only thing\nstopping two runs at once. The\ntactical sweeper (TS) checks the\nsame file, so the generator and\nthe sweeper can never run at the\nsame time. That is deliberate:\nboth drive the same engine.",
			"rawText": "The lockfile is the only thing\nstopping two runs at once. The\ntactical sweeper (TS) checks the\nsame file, so the generator and\nthe sweeper can never run at the\nsame time. That is deliberate:\nboth drive the same engine.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "rwoFehYPm5hJqyhxpuBLB",
			"originalText": "The lockfile is the only thing\nstopping two runs at once. The\ntactical sweeper (TS) checks the\nsame file, so the generator and\nthe sweeper can never run at the\nsame time. That is deliberate:\nboth drive the same engine.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "xCP0Wgc2JV1MdlFE1Z9ur",
			"type": "rectangle",
			"x": 340,
			"y": 1220,
			"width": 440,
			"height": 280,
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
			"index": "a044",
			"roundness": null,
			"seed": 1992634857,
			"version": 1,
			"versionNonce": 1198227209,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "5xPnccro"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "5xPnccro",
			"type": "text",
			"x": 345,
			"y": 1285,
			"width": 363,
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
			"index": "a045",
			"roundness": null,
			"seed": 61710362,
			"version": 3,
			"versionNonce": 1190771730,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266598,
			"locked": false,
			"text": "If the process is killed - window\nclosed, machine restarted, power\ncut - R.14 never runs and the\nlockfile is left behind. Every\nlater run then refuses to start\nuntil it is deleted by hand.",
			"rawText": "If the process is killed - window\nclosed, machine restarted, power\ncut - R.14 never runs and the\nlockfile is left behind. Every\nlater run then refuses to start\nuntil it is deleted by hand.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "xCP0Wgc2JV1MdlFE1Z9ur",
			"originalText": "If the process is killed - window\nclosed, machine restarted, power\ncut - R.14 never runs and the\nlockfile is left behind. Every\nlater run then refuses to start\nuntil it is deleted by hand.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "kwAz23F8y017pPRGtRDgc",
			"type": "rectangle",
			"x": 340,
			"y": 1540,
			"width": 440,
			"height": 240,
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
			"index": "a046",
			"roundness": null,
			"seed": 965493190,
			"version": 1,
			"versionNonce": 1932262334,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "8OGmLWeB"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "8OGmLWeB",
			"type": "text",
			"x": 345,
			"y": 1610,
			"width": 374,
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
			"index": "a047",
			"roundness": null,
			"seed": 811634709,
			"version": 2,
			"versionNonce": 2085382610,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266598,
			"locked": false,
			"text": "The depth limit of 3 is written\ninto the start script, not chosen\nin the app. Changing how deep the\ntree goes means editing this file.",
			"rawText": "The depth limit of 3 is written\ninto the start script, not chosen\nin the app. Changing how deep the\ntree goes means editing this file.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "kwAz23F8y017pPRGtRDgc",
			"originalText": "The depth limit of 3 is written\ninto the start script, not chosen\nin the app. Changing how deep the\ntree goes means editing this file.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "SU6R7kpTNevZnVi8YSp96",
			"type": "rectangle",
			"x": 340,
			"y": 1820,
			"width": 440,
			"height": 300,
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
			"index": "a048",
			"roundness": null,
			"seed": 572579174,
			"version": 1,
			"versionNonce": 216339480,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "H4fp2GRZ"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "H4fp2GRZ",
			"type": "text",
			"x": 345,
			"y": 1882.5,
			"width": 385,
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
			"index": "a049",
			"roundness": null,
			"seed": 421836564,
			"version": 2,
			"versionNonce": 1451450258,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266599,
			"locked": false,
			"text": "Why a queue taken from the front:\nevery short line is finished before\nany long line is started. Stop the\nrun early and you have a complete\nshallow book. Taken from the back,\none line would go very deep while\nwhole openings stayed untouched.",
			"rawText": "Why a queue taken from the front:\nevery short line is finished before\nany long line is started. Stop the\nrun early and you have a complete\nshallow book. Taken from the back,\none line would go very deep while\nwhole openings stayed untouched.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "SU6R7kpTNevZnVi8YSp96",
			"originalText": "Why a queue taken from the front:\nevery short line is finished before\nany long line is started. Stop the\nrun early and you have a complete\nshallow book. Taken from the back,\none line would go very deep while\nwhole openings stayed untouched.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "vd0EVzSPWURBobwXnzzbO",
			"type": "rectangle",
			"x": 340,
			"y": 2160,
			"width": 440,
			"height": 260,
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
			"index": "a050",
			"roundness": null,
			"seed": 1640878300,
			"version": 1,
			"versionNonce": 532030286,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ilKIfmKr"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "ilKIfmKr",
			"type": "text",
			"x": 345,
			"y": 2227.5,
			"width": 385,
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
			"index": "a051",
			"roundness": null,
			"seed": 104998441,
			"version": 2,
			"versionNonce": 1104518482,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266599,
			"locked": false,
			"text": "The visited list is kept in memory\nonly. It empties when the run ends,\nso a fresh run walks positions it\nhas seen before - though the caches\nmean it does not re-fetch them.",
			"rawText": "The visited list is kept in memory\nonly. It empties when the run ends,\nso a fresh run walks positions it\nhas seen before - though the caches\nmean it does not re-fetch them.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "vd0EVzSPWURBobwXnzzbO",
			"originalText": "The visited list is kept in memory\nonly. It empties when the run ends,\nso a fresh run walks positions it\nhas seen before - though the caches\nmean it does not re-fetch them.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "vTkTsNF9h7CFU0f6dIBor",
			"type": "rectangle",
			"x": 900.2314506565233,
			"y": -300,
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
			"index": "a052",
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
			"x": 910.8590838015273,
			"y": -289.9647816813314,
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
			"index": "a053",
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
			"x": 959.0790148498888,
			"y": -289.0795554089714,
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
			"index": "a054",
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
			"x": 900,
			"y": -241.91655699190778,
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
			"index": "a055",
			"roundness": null,
			"seed": 162519563,
			"version": 693,
			"versionNonce": 1794208594,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "HM6x5wxV"
				}
			],
			"updated": 1786851266456,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "HM6x5wxV",
			"type": "text",
			"x": 910.627633145004,
			"y": -231.88133867323916,
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
			"index": "a056",
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
			"x": 965.627935325296,
			"y": -229.76078869263256,
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
			"index": "a057",
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
			"x": 900.6594011380018,
			"y": -186.08957177807042,
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
			"index": "a058",
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
			"x": 911.2870342830058,
			"y": -176.0543534594018,
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
			"index": "a059",
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
			"x": 901.8667379841572,
			"y": -128.41169329211039,
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
			"index": "a060",
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
			"x": 912.4943711291612,
			"y": -118.37647497344176,
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
			"index": "a061",
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
			"x": 960.2728835215164,
			"y": -176.2881318197051,
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
			"index": "a062",
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
			"x": 965.2212701202568,
			"y": -114.64499713278656,
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
			"index": "a063",
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
			"x": 904.168450123376,
			"y": -70.11446388832269,
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
			"index": "a064",
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
			"x": 914.79608326838,
			"y": -60.07924556965406,
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
			"index": "a065",
			"roundness": null,
			"seed": 542300235,
			"version": 478,
			"versionNonce": 227517134,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786851266456,
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
			"x": 963.6813114756167,
			"y": -55.686169158024995,
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
			"index": "a066",
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
			"x": 902.9586882447841,
			"y": -13.291515391427083,
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
			"index": "a067",
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
			"x": 913.586321389788,
			"y": -3.256297072758457,
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
			"index": "a068",
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
			"x": 958.7223077179132,
			"y": -3.5970563501020933,
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
			"index": "a069",
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
		},
		{
			"id": "ALdX8a0WaLySKUf8IW2sQ",
			"type": "arrow",
			"x": 20,
			"y": 820,
			"width": 20,
			"height": 340,
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
			"index": "a070",
			"roundness": {
				"type": 2
			},
			"seed": 612817764,
			"version": 1,
			"versionNonce": 253402231,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "5bIZPZIW"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false,
			"points": [
				[
					0,
					0
				],
				[
					-20,
					340
				]
			],
			"lastCommittedPoint": null,
			"startBinding": {
				"elementId": "h28UTeUaSx8CrY0PTx5Im",
				"focus": 0,
				"gap": 4
			},
			"endBinding": {
				"elementId": "Jw5RuUHEnPK66QiMLAJkd",
				"focus": 0,
				"gap": 4
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false
		},
		{
			"id": "5bIZPZIW",
			"type": "text",
			"x": -56,
			"y": 977.5,
			"width": 88,
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
			"index": "a071",
			"roundness": null,
			"seed": 999924729,
			"version": 1,
			"versionNonce": 610493953,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "no error",
			"rawText": "no error",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "ALdX8a0WaLySKUf8IW2sQ",
			"originalText": "no error",
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
		"currentItemBackgroundColor": "#b2f2bb",
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
		"scrollX": 3345.402031856465,
		"scrollY": 396.3153743236478,
		"zoom": {
			"value": 0.158063
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
			"type": "hand",
			"customType": null,
			"locked": false,
			"fromSelection": false,
			"lastActiveTool": null
		},
		"disableContextMenu": false,
		"bindingPreference": "enabled",
		"isBindingEnabled": false,
		"isMidpointSnappingEnabled": true,
		"boxSelectionMode": "contain"
	},
	"prevTextMode": "parsed",
	"files": {}
}
```
%%