---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
A list that is missing altogether
counts as empty here and gives the
same verdict. ^JHbhaH9B

"Present" means the candidate's
notation is the same as the first
move of one of the engine lines. The
rest of each line is never looked at. ^4RRd8HYx

The difference is measured as a
distance, so a candidate that scores
better than the stated best is judged
by how far it sits from it, in either
direction.

A difference exactly equal to the
tolerance counts as within it. ^bpLMNJkk

"Worst" here means the last entry in
the list. That is only the worst one
because the lists are sorted before
they arrive - by LS.15 for the local
engine, and by B2.24 for ChessDB. ^UjFWGHrG

When the scores came from a fresh
ChessDB fetch, both differences work
out as not-a-number (see M.07). Every
comparison against it is false, so
PV.07 answers no and gives REJECTED,
and PV.11 answers no and sends the
candidate to a deeper search. Neither
path can reach VALID. ^FZwmpBO7

PV.01 · Judge one
candidate move against
an engine move list. ^V2vmcW6s

PV.02 · Use:
• candidate move
• engine move list
• best engine score
• allowed tolerance ^jC12LLll

PV.03 · Is the engine
move list empty? ^JX0Setle

yes ^RoeYoBmX

no ^VhiYkSkv

PV.04 · Verdict:
NEED DEEPER SEARCH. ^By6TpuWY

PV.05 · Is the
candidate move present
in the engine list? ^iAxWrpTT

PV.06 · Work out the
difference between:
• this candidate's
  engine score
• the best engine score ^C5WuxDeC

yes ^HbwR5Ag8

PV.07 · Is the
difference within
the allowed tolerance? ^44yA8vmW

PV.08 · Verdict:
VALID. ^QAJsYJcd

yes ^ycL3BQub

no ^uajlldv2

PV.09 · Verdict:
REJECTED. ^yAL9t7kw

PV.10 · Take the worst
move currently present
in the engine list.

Work out how far its
score is from the best
engine score. ^wjn5Tn9k

no ^7gbaoRAt

PV.11 · Is even that
worst listed move
already outside the
allowed tolerance? ^J0FdRMXh

yes ^JSaftyyy

Loop back
to PV.04. ^1KupaYja

no ^Dqv0dv3Q

If the worst move that
made it into the engine
list is already too bad,
a candidate that did not
make the list must also
be too bad.

If the worst listed move
is still within tolerance,
the missing candidate
might still be acceptable,
so a deeper search is
needed. ^CXE01kC3

s2 ^oBNdoZaa

I don't understand this ^xkSA1Tth

c2 ^BnZWqlA1

this looks wrong to me ^I2skCKFa

f3 ^O6mL5KTV

v3 ^vYl2I28c

database ^XKtQPk3H

API ^Tx0tQwPT

z2 ^qZGPylqz

note ^EEv9yXPj

g1 ^Mok1jqxk

loop back ^OIckvHBD

## Drawing
```json
{
	"type": "excalidraw",
	"version": 2,
	"source": "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.26.4",
	"elements": [
		{
			"id": "pbW3FaZ9aUpDi4bZFJfL5",
			"type": "rectangle",
			"x": -1100,
			"y": 460,
			"width": 540,
			"height": 115,
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
			"seed": 2096186127,
			"version": 1,
			"versionNonce": 2118095856,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "JHbhaH9B"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "JHbhaH9B",
			"type": "text",
			"x": -1085,
			"y": 480,
			"width": 374,
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
			"seed": 188622044,
			"version": 1,
			"versionNonce": 966521631,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "A list that is missing altogether\ncounts as empty here and gives the\nsame verdict.",
			"rawText": "A list that is missing altogether\ncounts as empty here and gives the\nsame verdict.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "pbW3FaZ9aUpDi4bZFJfL5",
			"originalText": "A list that is missing altogether\ncounts as empty here and gives the\nsame verdict.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "bc0kF5vBM4sRQea8RDgWD",
			"type": "rectangle",
			"x": 660,
			"y": 420,
			"width": 540,
			"height": 140,
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
			"index": "a002",
			"roundness": null,
			"seed": 790054601,
			"version": 1,
			"versionNonce": 958172514,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "4RRd8HYx"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "4RRd8HYx",
			"type": "text",
			"x": 675,
			"y": 440,
			"width": 407,
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
			"index": "a003",
			"roundness": null,
			"seed": 846096842,
			"version": 1,
			"versionNonce": 689536550,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "\"Present\" means the candidate's\nnotation is the same as the first\nmove of one of the engine lines. The\nrest of each line is never looked at.",
			"rawText": "\"Present\" means the candidate's\nnotation is the same as the first\nmove of one of the engine lines. The\nrest of each line is never looked at.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "bc0kF5vBM4sRQea8RDgWD",
			"originalText": "\"Present\" means the candidate's\nnotation is the same as the first\nmove of one of the engine lines. The\nrest of each line is never looked at.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "b9nHHbXjDVKP11fG22DGH",
			"type": "rectangle",
			"x": -1100,
			"y": 900,
			"width": 540,
			"height": 240,
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
			"index": "a004",
			"roundness": null,
			"seed": 1225746818,
			"version": 1,
			"versionNonce": 1490938475,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "bpLMNJkk"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "bpLMNJkk",
			"type": "text",
			"x": -1085,
			"y": 920,
			"width": 407,
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
			"seed": 1839922496,
			"version": 1,
			"versionNonce": 557226766,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "The difference is measured as a\ndistance, so a candidate that scores\nbetter than the stated best is judged\nby how far it sits from it, in either\ndirection.\n\nA difference exactly equal to the\ntolerance counts as within it.",
			"rawText": "The difference is measured as a\ndistance, so a candidate that scores\nbetter than the stated best is judged\nby how far it sits from it, in either\ndirection.\n\nA difference exactly equal to the\ntolerance counts as within it.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "b9nHHbXjDVKP11fG22DGH",
			"originalText": "The difference is measured as a\ndistance, so a candidate that scores\nbetter than the stated best is judged\nby how far it sits from it, in either\ndirection.\n\nA difference exactly equal to the\ntolerance counts as within it.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "hBPL4aocSNsU15gzcNoBx",
			"type": "rectangle",
			"x": -1100,
			"y": 1240,
			"width": 540,
			"height": 165,
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
			"index": "a006",
			"roundness": null,
			"seed": 65664799,
			"version": 1,
			"versionNonce": 346645579,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "UjFWGHrG"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "UjFWGHrG",
			"type": "text",
			"x": -1085,
			"y": 1260,
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
			"index": "a007",
			"roundness": null,
			"seed": 388952691,
			"version": 1,
			"versionNonce": 172935034,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "\"Worst\" here means the last entry in\nthe list. That is only the worst one\nbecause the lists are sorted before\nthey arrive - by LS.15 for the local\nengine, and by B2.24 for ChessDB.",
			"rawText": "\"Worst\" here means the last entry in\nthe list. That is only the worst one\nbecause the lists are sorted before\nthey arrive - by LS.15 for the local\nengine, and by B2.24 for ChessDB.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "hBPL4aocSNsU15gzcNoBx",
			"originalText": "\"Worst\" here means the last entry in\nthe list. That is only the worst one\nbecause the lists are sorted before\nthey arrive - by LS.15 for the local\nengine, and by B2.24 for ChessDB.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "qkvFsSQoO1yVnpAp9Baka",
			"type": "rectangle",
			"x": 1700,
			"y": 1360,
			"width": 560,
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
			"index": "a008",
			"roundness": null,
			"seed": 1713554687,
			"version": 1,
			"versionNonce": 725196218,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "FZwmpBO7"
				}
			],
			"updated": 1786830000000,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "FZwmpBO7",
			"type": "text",
			"x": 1715,
			"y": 1380,
			"width": 407,
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
			"index": "a009",
			"roundness": null,
			"seed": 2088148820,
			"version": 1,
			"versionNonce": 254105874,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786830000000,
			"locked": false,
			"text": "When the scores came from a fresh\nChessDB fetch, both differences work\nout as not-a-number (see M.07). Every\ncomparison against it is false, so\nPV.07 answers no and gives REJECTED,\nand PV.11 answers no and sends the\ncandidate to a deeper search. Neither\npath can reach VALID.",
			"rawText": "When the scores came from a fresh\nChessDB fetch, both differences work\nout as not-a-number (see M.07). Every\ncomparison against it is false, so\nPV.07 answers no and gives REJECTED,\nand PV.11 answers no and sends the\ncandidate to a deeper search. Neither\npath can reach VALID.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "left",
			"verticalAlign": "middle",
			"containerId": "qkvFsSQoO1yVnpAp9Baka",
			"originalText": "When the scores came from a fresh\nChessDB fetch, both differences work\nout as not-a-number (see M.07). Every\ncomparison against it is false, so\nPV.07 answers no and gives REJECTED,\nand PV.11 answers no and sends the\ncandidate to a deeper search. Neither\npath can reach VALID.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "7L2nUDPo",
			"type": "ellipse",
			"x": -166.66665649414062,
			"y": -157.5208511352539,
			"width": 207.33334350585938,
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
			"index": "a010",
			"roundness": {
				"type": 2
			},
			"seed": 291429838,
			"version": 22,
			"versionNonce": 101502478,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "V2vmcW6s"
				},
				{
					"id": "AGJTC3ug",
					"type": "arrow"
				}
			],
			"updated": 1786846856966,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "V2vmcW6s",
			"type": "text",
			"x": -128.80339132074744,
			"y": -119.42391740933378,
			"width": 132,
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
			"index": "a011",
			"roundness": null,
			"seed": 1385760466,
			"version": 8,
			"versionNonce": 1981825614,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846824004,
			"locked": false,
			"text": "PV.01 ·\nJudge one\ncandidate\nmove against\nan engine\nmove list.",
			"rawText": "PV.01 · Judge one\ncandidate move against\nan engine move list.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "7L2nUDPo",
			"originalText": "PV.01 · Judge one\ncandidate move against\nan engine move list.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "4zVkaJQd",
			"type": "rectangle",
			"x": -100.6666259765625,
			"y": 126.47916412353516,
			"width": 149.99993896484375,
			"height": 235,
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
			"roundness": null,
			"seed": 12175890,
			"version": 21,
			"versionNonce": 197746190,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "jC12LLll"
				},
				{
					"id": "AGJTC3ug",
					"type": "arrow"
				},
				{
					"id": "P5ZSRNl2",
					"type": "arrow"
				}
			],
			"updated": 1786846882717,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "jC12LLll",
			"type": "text",
			"x": -91.66665649414062,
			"y": 131.47916412353516,
			"width": 132,
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
			"index": "a013",
			"roundness": null,
			"seed": 1135101394,
			"version": 6,
			"versionNonce": 1126371470,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846849224,
			"locked": false,
			"text": "PV.02 · Use:\n• candidate\nmove\n• engine\nmove list\n• best\nengine score\n• allowed\ntolerance",
			"rawText": "PV.02 · Use:\n• candidate move\n• engine move list\n• best engine score\n• allowed tolerance",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "4zVkaJQd",
			"originalText": "PV.02 · Use:\n• candidate move\n• engine move list\n• best engine score\n• allowed tolerance",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "AGJTC3ug",
			"type": "arrow",
			"x": -47.33331298828125,
			"y": 65.14582061767578,
			"width": 19.560625226863568,
			"height": 55.33334350585939,
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
			"roundness": {
				"type": 2
			},
			"seed": 1850143566,
			"version": 33,
			"versionNonce": 508205390,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786855772760,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					19.560625226863568,
					55.33334350585939
				]
			],
			"startBinding": {
				"elementId": "7L2nUDPo",
				"mode": "inside",
				"fixedPoint": [
					0.575562721789064,
					0.9852507599687155
				]
			},
			"endBinding": {
				"elementId": "4zVkaJQd",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"hasTextLink": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "e2ccwEdq",
			"type": "diamond",
			"x": -106.6666259765625,
			"y": 490.4791641235351,
			"width": 220.6666259765625,
			"height": 270,
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
			"seed": 1726721746,
			"version": 23,
			"versionNonce": 1116132178,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "JX0Setle"
				},
				{
					"id": "P5ZSRNl2",
					"type": "arrow"
				},
				{
					"id": "z9bfKGe6",
					"type": "arrow"
				},
				{
					"id": "38kLJl8Q",
					"type": "arrow"
				}
			],
			"updated": 1786846919751,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "JX0Setle",
			"type": "text",
			"x": -45.999969482421875,
			"y": 562.9791641235352,
			"width": 99,
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
			"index": "a016",
			"roundness": null,
			"seed": 145343246,
			"version": 6,
			"versionNonce": 1671716558,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846880295,
			"locked": false,
			"text": "PV.03 ·\nIs the\nengine\nmove list\nempty?",
			"rawText": "PV.03 · Is the engine\nmove list empty?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "e2ccwEdq",
			"originalText": "PV.03 · Is the engine\nmove list empty?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "P5ZSRNl2",
			"type": "arrow",
			"x": -24.260670083496898,
			"y": 367.4791641235352,
			"width": 27.23802749061057,
			"height": 117.48648163994739,
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
			"roundness": {
				"type": 2
			},
			"seed": 62489422,
			"version": 42,
			"versionNonce": 1552301966,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786855772763,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					27.23802749061057,
					117.48648163994739
				]
			],
			"startBinding": {
				"elementId": "4zVkaJQd",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					1
				]
			},
			"endBinding": {
				"elementId": "e2ccwEdq",
				"mode": "orbit",
				"fixedPoint": [
					0.5030212407914805,
					0.0012592592592593772
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"hasTextLink": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "38kLJl8Q",
			"type": "arrow",
			"x": -111.76260713402215,
			"y": 629.3073064209917,
			"width": 147.79895050905,
			"height": 77.80429459690754,
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
			"seed": 2048401106,
			"version": 127,
			"versionNonce": 312438674,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "RoeYoBmX"
				}
			],
			"updated": 1786847207528,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-147.79895050905,
					77.80429459690754
				]
			],
			"startBinding": {
				"elementId": "e2ccwEdq",
				"mode": "orbit",
				"fixedPoint": [
					0.0012575531019787165,
					0.5037037037037043
				]
			},
			"endBinding": {
				"elementId": "slmZCUfG",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.46345926209821187
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "RoeYoBmX",
			"type": "text",
			"x": -202.16208238854713,
			"y": 655.7094537194455,
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
			"index": "a019",
			"roundness": null,
			"seed": 1316610770,
			"version": 6,
			"versionNonce": 1818138830,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846901981,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "38kLJl8Q",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "z9bfKGe6",
			"type": "arrow",
			"x": 119.58034060438185,
			"y": 627.8458727952949,
			"width": 231.36071705482613,
			"height": 53.99942638015898,
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
			"roundness": {
				"type": 2
			},
			"seed": 764748754,
			"version": 151,
			"versionNonce": 418586062,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "VhiYkSkv"
				}
			],
			"updated": 1786855772773,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					231.36071705482613,
					53.99942638015898
				]
			],
			"startBinding": {
				"elementId": "e2ccwEdq",
				"mode": "orbit",
				"fixedPoint": [
					0.9987424468980213,
					0.5037037037037035
				]
			},
			"endBinding": {
				"elementId": "pfbMv1pI",
				"mode": "orbit",
				"fixedPoint": [
					0.502940995899516,
					0.0012559523809524567
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "VhiYkSkv",
			"type": "text",
			"x": 224.2606991317949,
			"y": 642.3455859853744,
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
			"index": "a021",
			"roundness": null,
			"seed": 400118994,
			"version": 5,
			"versionNonce": 1365313678,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846900262,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "z9bfKGe6",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "slmZCUfG",
			"type": "ellipse",
			"x": -449.9999084472656,
			"y": 680.4790522257485,
			"width": 207.33334350585938,
			"height": 156,
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
			"roundness": null,
			"seed": 1597857298,
			"version": 62,
			"versionNonce": 1339673618,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "By6TpuWY"
				},
				{
					"id": "38kLJl8Q",
					"type": "arrow"
				}
			],
			"updated": 1786847207527,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "By6TpuWY",
			"type": "text",
			"x": -406.63664327387244,
			"y": 708.3247232931978,
			"width": 121,
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
			"index": "a023",
			"roundness": null,
			"seed": 896357902,
			"version": 51,
			"versionNonce": 246053330,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847207527,
			"locked": false,
			"text": "PV.04 ·\nVerdict:\nNEED DEEPER\nSEARCH.",
			"rawText": "PV.04 · Verdict:\nNEED DEEPER SEARCH.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "slmZCUfG",
			"originalText": "PV.04 · Verdict:\nNEED DEEPER SEARCH.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "pfbMv1pI",
			"type": "diamond",
			"x": 203.99993896484375,
			"y": 683.1458307902017,
			"width": 306.666748046875,
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
			"index": "a024",
			"roundness": null,
			"seed": 1083534034,
			"version": 218,
			"versionNonce": 1360126798,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "iAxWrpTT"
				},
				{
					"id": "z9bfKGe6",
					"type": "arrow"
				},
				{
					"id": "mvB8Wk4E",
					"type": "arrow"
				},
				{
					"id": "31aWVSsE",
					"type": "arrow"
				}
			],
			"updated": 1786847067249,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "iAxWrpTT",
			"type": "text",
			"x": 285.6666259765625,
			"y": 768.1458307902017,
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
			"index": "a025",
			"roundness": null,
			"seed": 1767279566,
			"version": 101,
			"versionNonce": 552493518,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846937264,
			"locked": false,
			"text": "PV.05 · Is\nthe\ncandidate\nmove present\nin the engine\nlist?",
			"rawText": "PV.05 · Is the\ncandidate move present\nin the engine list?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "pfbMv1pI",
			"originalText": "PV.05 · Is the\ncandidate move present\nin the engine list?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "PuGSR8Yb",
			"type": "rectangle",
			"x": -88.66656494140625,
			"y": 937.8124567667643,
			"width": 227.333251953125,
			"height": 185,
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
			"roundness": null,
			"seed": 1455076690,
			"version": 33,
			"versionNonce": 608468366,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "C5WuxDeC"
				},
				{
					"id": "mvB8Wk4E",
					"type": "arrow"
				},
				{
					"id": "3qQAJd7E",
					"type": "arrow"
				}
			],
			"updated": 1786847009750,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "C5WuxDeC",
			"type": "text",
			"x": -79.49993896484375,
			"y": 942.8124567667643,
			"width": 209,
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
			"index": "a027",
			"roundness": null,
			"seed": 1684882834,
			"version": 23,
			"versionNonce": 1920864590,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846986238,
			"locked": false,
			"text": "PV.06 · Work out\nthe\ndifference between:\n• this candidate's\n  engine score\n• the best engine\nscore",
			"rawText": "PV.06 · Work out the\ndifference between:\n• this candidate's\n  engine score\n• the best engine score",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "PuGSR8Yb",
			"originalText": "PV.06 · Work out the\ndifference between:\n• this candidate's\n  engine score\n• the best engine score",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "mvB8Wk4E",
			"type": "arrow",
			"x": 200.5719563091096,
			"y": 849.232180360892,
			"width": 61.89950907537508,
			"height": 82.5803977505119,
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
			"seed": 547919310,
			"version": 42,
			"versionNonce": 1755984910,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "HbwR5Ag8"
				}
			],
			"updated": 1786855772779,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-61.89950907537508,
					82.5803977505119
				]
			],
			"startBinding": {
				"elementId": "pfbMv1pI",
				"mode": "orbit",
				"fixedPoint": [
					0.0012554344494537192,
					0.503125
				]
			},
			"endBinding": {
				"elementId": "PuGSR8Yb",
				"mode": "orbit",
				"fixedPoint": [
					0.6088194063665556,
					0.6088194063665548
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"hasTextLink": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "HbwR5Ag8",
			"type": "text",
			"x": 153.12220177142206,
			"y": 878.0223792361479,
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
			"index": "a029",
			"roundness": null,
			"seed": 1415981522,
			"version": 6,
			"versionNonce": 132874702,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786846991009,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "mvB8Wk4E",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "1VNicbHH",
			"type": "diamond",
			"x": 35.33331298828125,
			"y": 1201.8124567667644,
			"width": 185.3333740234375,
			"height": 470,
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
			"roundness": null,
			"seed": 1042844050,
			"version": 19,
			"versionNonce": 571590354,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "44yA8vmW"
				},
				{
					"id": "3qQAJd7E",
					"type": "arrow"
				},
				{
					"id": "9UztwHJ1",
					"type": "arrow"
				},
				{
					"id": "lofKEm3i",
					"type": "arrow"
				}
			],
			"updated": 1786847033911,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "44yA8vmW",
			"type": "text",
			"x": 89.66665649414062,
			"y": 1324.3124567667644,
			"width": 77,
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
			"index": "a031",
			"roundness": null,
			"seed": 1766335118,
			"version": 6,
			"versionNonce": 1737567822,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847008190,
			"locked": false,
			"text": "PV.07 ·\nIs the\ndiffere\nnce\nwithin\nthe\nallowed\ntoleran\nce?",
			"rawText": "PV.07 · Is the\ndifference within\nthe allowed tolerance?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "1VNicbHH",
			"originalText": "PV.07 · Is the\ndifference within\nthe allowed tolerance?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "3qQAJd7E",
			"type": "arrow",
			"x": 89.33331298828125,
			"y": 1120.479113260905,
			"width": 36.41739350476203,
			"height": 76.49112855154317,
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
			"seed": 928543438,
			"version": 37,
			"versionNonce": 1119553678,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786855772783,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					36.41739350476203,
					76.49112855154317
				]
			],
			"startBinding": {
				"elementId": "PuGSR8Yb",
				"mode": "inside",
				"fixedPoint": [
					0.7829909456729639,
					0.9873873324007607
				]
			},
			"endBinding": {
				"elementId": "1VNicbHH",
				"mode": "orbit",
				"fixedPoint": [
					0.5017984509807667,
					0.001255319148935996
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"hasTextLink": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "D7UQa6Lw",
			"type": "ellipse",
			"x": -244.66668701171875,
			"y": 1545.8124669392903,
			"width": 152,
			"height": 120,
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
			"seed": 757117582,
			"version": 40,
			"versionNonce": 651841170,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "QAJsYJcd"
				},
				{
					"id": "9UztwHJ1",
					"type": "arrow"
				}
			],
			"updated": 1786847031664,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "QAJsYJcd",
			"type": "text",
			"x": -212.90680238189637,
			"y": 1568.3860600680973,
			"width": 88,
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
			"index": "a034",
			"roundness": null,
			"seed": 1661040910,
			"version": 26,
			"versionNonce": 1735830610,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847031664,
			"locked": false,
			"text": "PV.08 ·\nVerdict:\nVALID.",
			"rawText": "PV.08 · Verdict:\nVALID.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "D7UQa6Lw",
			"originalText": "PV.08 · Verdict:\nVALID.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "9UztwHJ1",
			"type": "arrow",
			"x": 30.63301406286606,
			"y": 1442.250159715438,
			"width": 135.58329148714034,
			"height": 122.01766187512726,
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
			"seed": 1288993102,
			"version": 61,
			"versionNonce": 406934034,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "ycL3BQub"
				}
			],
			"updated": 1786847031664,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-135.58329148714034,
					122.01766187512726
				]
			],
			"startBinding": {
				"elementId": "1VNicbHH",
				"mode": "orbit",
				"fixedPoint": [
					0.0012544961274519259,
					0.502127659574468
				]
			},
			"endBinding": {
				"elementId": "D7UQa6Lw",
				"mode": "orbit",
				"fixedPoint": [
					0.615388357722602,
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
			"id": "ycL3BQub",
			"type": "text",
			"x": -53.658631680704104,
			"y": 1490.7589906530015,
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
			"seed": 1204157202,
			"version": 6,
			"versionNonce": 172184718,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847030645,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "9UztwHJ1",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "lofKEm3i",
			"type": "arrow",
			"x": 225.47309575160557,
			"y": 1441.9800164885949,
			"width": 92.7982516611363,
			"height": 76.74985742387298,
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
			"seed": 526218642,
			"version": 78,
			"versionNonce": 829242002,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "uajlldv2"
				}
			],
			"updated": 1786847051781,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					92.7982516611363,
					76.74985742387298
				]
			],
			"startBinding": {
				"elementId": "1VNicbHH",
				"mode": "orbit",
				"fixedPoint": [
					0.998745503872548,
					0.502127659574468
				]
			},
			"endBinding": {
				"elementId": "MUMrw3hM",
				"mode": "orbit",
				"fixedPoint": [
					0.5001,
					0.356249328116365
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "uajlldv2",
			"type": "text",
			"x": 260.8722215821737,
			"y": 1467.8549452005313,
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
			"index": "a038",
			"roundness": null,
			"seed": 2137070930,
			"version": 5,
			"versionNonce": 564680718,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847037070,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "lofKEm3i",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "MUMrw3hM",
			"type": "ellipse",
			"x": 294,
			"y": 1504.479123433431,
			"width": 155.33343505859375,
			"height": 164,
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
			"seed": 1628291150,
			"version": 54,
			"versionNonce": 1913834898,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "yAL9t7kw"
				},
				{
					"id": "lofKEm3i",
					"type": "arrow"
				},
				{
					"id": "jEXaSlCb",
					"type": "arrow"
				}
			],
			"updated": 1786847188513,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "yAL9t7kw",
			"type": "text",
			"x": 322.248054891831,
			"y": 1548.996367376134,
			"width": 99,
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
			"index": "a040",
			"roundness": null,
			"seed": 441639310,
			"version": 35,
			"versionNonce": 1981298702,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847188513,
			"locked": false,
			"text": "PV.09 ·\nVerdict:\nREJECTED.",
			"rawText": "PV.09 · Verdict:\nREJECTED.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "MUMrw3hM",
			"originalText": "PV.09 · Verdict:\nREJECTED.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "RnIBi3kg",
			"type": "rectangle",
			"x": 533.3333129882812,
			"y": 907.8124567667642,
			"width": 280,
			"height": 280.0000305175781,
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
			"seed": 2109028818,
			"version": 31,
			"versionNonce": 1425778514,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "wjn5Tn9k"
				},
				{
					"id": "31aWVSsE",
					"type": "arrow"
				},
				{
					"id": "DyxcO1wu",
					"type": "arrow"
				}
			],
			"updated": 1786847111407,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "wjn5Tn9k",
			"type": "text",
			"x": 552.3333129882812,
			"y": 960.3124720255532,
			"width": 242,
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
			"index": "a042",
			"roundness": null,
			"seed": 368744974,
			"version": 8,
			"versionNonce": 1263873038,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847066069,
			"locked": false,
			"text": "PV.10 · Take the worst\nmove currently present\nin the engine list.\n\nWork out how far its\nscore is from the best\nengine score.",
			"rawText": "PV.10 · Take the worst\nmove currently present\nin the engine list.\n\nWork out how far its\nscore is from the best\nengine score.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "RnIBi3kg",
			"originalText": "PV.10 · Take the worst\nmove currently present\nin the engine list.\n\nWork out how far its\nscore is from the best\nengine score.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "31aWVSsE",
			"type": "arrow",
			"x": 515.545727903997,
			"y": 847.2000645474607,
			"width": 94.0471540837932,
			"height": 54.6123922193035,
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
			"roundness": {
				"type": 2
			},
			"seed": 1091043470,
			"version": 37,
			"versionNonce": 1436844622,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "7gbaoRAt"
				}
			],
			"updated": 1786855772782,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					94.0471540837932,
					54.6123922193035
				]
			],
			"startBinding": {
				"elementId": "pfbMv1pI",
				"mode": "orbit",
				"fixedPoint": [
					0.9987445655505462,
					0.503125
				]
			},
			"endBinding": {
				"elementId": "RnIBi3kg",
				"mode": "orbit",
				"fixedPoint": [
					0.7462527048128009,
					0.25374729518719946
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"hasTextLink": false,
			"moveMidPointsWithElement": false
		},
		{
			"id": "7gbaoRAt",
			"type": "text",
			"x": 551.5693049458936,
			"y": 862.0062606571123,
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
			"index": "a044",
			"roundness": null,
			"seed": 914462290,
			"version": 5,
			"versionNonce": 1074368270,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847070381,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "31aWVSsE",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "DyxcO1wu",
			"type": "arrow",
			"x": 819.3333129882812,
			"y": 1174.4356501472403,
			"width": 280.47412837615275,
			"height": 191.01619628555818,
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
			"seed": 1292076562,
			"version": 78,
			"versionNonce": 1621496082,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847188515,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					280.47412837615275,
					191.01619628555818
				]
			],
			"startBinding": {
				"elementId": "RnIBi3kg",
				"mode": "orbit",
				"fixedPoint": [
					0.8044590334976554,
					0.8044590334976559
				]
			},
			"endBinding": {
				"elementId": "8njWvwa5",
				"mode": "orbit",
				"fixedPoint": [
					0.5013028817636812,
					0.001255952380952186
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "8njWvwa5",
			"type": "diamond",
			"x": 934.0272163071845,
			"y": 1368.4792794121636,
			"width": 341.11114501953125,
			"height": 420,
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
			"seed": 148714894,
			"version": 21,
			"versionNonce": 1719068750,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "J0FdRMXh"
				},
				{
					"id": "DyxcO1wu",
					"type": "arrow"
				},
				{
					"id": "jEXaSlCb",
					"type": "arrow"
				},
				{
					"id": "zFuOfgPJ",
					"type": "arrow"
				}
			],
			"updated": 1786847221546,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "J0FdRMXh",
			"type": "text",
			"x": 1038.8050025620673,
			"y": 1478.4792794121636,
			"width": 132,
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
			"index": "a047",
			"roundness": null,
			"seed": 1202959378,
			"version": 6,
			"versionNonce": 1308384338,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847173166,
			"locked": false,
			"text": "PV.11 · Is\neven that\nworst listed\nmove\nalready\noutside the\nallowed\ntolerance?",
			"rawText": "PV.11 · Is even that\nworst listed move\nalready outside the\nallowed tolerance?",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "8njWvwa5",
			"originalText": "PV.11 · Is even that\nworst listed move\nalready outside the\nallowed tolerance?",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "jEXaSlCb",
			"type": "arrow",
			"x": 928.4574339669887,
			"y": 1579.6726070332497,
			"width": 479.98573930693954,
			"height": 15.473305137160423,
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
			"roundness": {
				"type": 2
			},
			"seed": 1628977678,
			"version": 56,
			"versionNonce": 617632526,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "JSaftyyy"
				}
			],
			"updated": 1786847191053,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					-479.98573930693954,
					15.473305137160423
				]
			],
			"startBinding": {
				"elementId": "8njWvwa5",
				"mode": "orbit",
				"fixedPoint": [
					0.0012532572044092298,
					0.5023809523809524
				]
			},
			"endBinding": {
				"elementId": "MUMrw3hM",
				"mode": "inside",
				"fixedPoint": [
					0.9944523186639145,
					0.5528462727864588
				]
			},
			"startArrowhead": null,
			"endArrowhead": "arrow",
			"elbowed": false,
			"moveMidPointsWithElement": false,
			"hasTextLink": false
		},
		{
			"id": "JSaftyyy",
			"type": "text",
			"x": 671.9645643135188,
			"y": 1574.90925960183,
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
			"index": "a049",
			"roundness": null,
			"seed": 64902542,
			"version": 6,
			"versionNonce": 224177362,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847191054,
			"locked": false,
			"text": "yes",
			"rawText": "yes",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "jEXaSlCb",
			"originalText": "yes",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "iF3H42ftDN95WaRbZSh3i",
			"type": "ellipse",
			"x": 1401.1224376904156,
			"y": 1609.2410344926134,
			"width": 167.33334350585938,
			"height": 164.8888888888887,
			"angle": 0,
			"strokeColor": "#1e1e1e",
			"backgroundColor": "#fff5f5",
			"fillStyle": "solid",
			"strokeWidth": 2,
			"strokeStyle": "solid",
			"roughness": 0,
			"opacity": 100,
			"groupIds": [],
			"frameId": null,
			"index": "a050",
			"roundness": null,
			"seed": 1897863698,
			"version": 94,
			"versionNonce": 243871506,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "1KupaYja"
				},
				{
					"id": "zFuOfgPJ",
					"type": "arrow"
				}
			],
			"updated": 1786847383823,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "1KupaYja",
			"type": "text",
			"x": 1435.1278384875397,
			"y": 1666.8884531992335,
			"width": 99,
			"height": 50,
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
			"seed": 907413458,
			"version": 82,
			"versionNonce": 662011090,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847383823,
			"locked": false,
			"text": "Loop back\nto PV.04.",
			"rawText": "Loop back\nto PV.04.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "iF3H42ftDN95WaRbZSh3i",
			"originalText": "Loop back\nto PV.04.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "zFuOfgPJ",
			"type": "arrow",
			"x": 1270.1226055370953,
			"y": 1580.5744085160509,
			"width": 134.38222356984193,
			"height": 71.72360065455973,
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
			"roundness": {
				"type": 2
			},
			"seed": 1587471758,
			"version": 57,
			"versionNonce": 17961618,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "Dqv0dv3Q"
				}
			],
			"updated": 1786847383824,
			"link": null,
			"locked": false,
			"points": [
				[
					0,
					0
				],
				[
					134.38222356984193,
					71.72360065455973
				]
			],
			"startBinding": {
				"elementId": "8njWvwa5",
				"mode": "inside",
				"fixedPoint": [
					0.9852958313943883,
					0.5049884026283031
				]
			},
			"endBinding": {
				"elementId": "iF3H42ftDN95WaRbZSh3i",
				"mode": "orbit",
				"fixedPoint": [
					0.46141511998137397,
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
			"id": "Dqv0dv3Q",
			"type": "text",
			"x": 1326.3137173220164,
			"y": 1603.9362088433306,
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
			"index": "a053",
			"roundness": null,
			"seed": 1531042578,
			"version": 5,
			"versionNonce": 1654943310,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847228590,
			"locked": false,
			"text": "no",
			"rawText": "no",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "zFuOfgPJ",
			"originalText": "no",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "9RYR7GpN",
			"type": "rectangle",
			"x": 1232.7892450770257,
			"y": 900.2781755154722,
			"width": 417.7777777777778,
			"height": 477.0370144314236,
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
			"index": "a054",
			"roundness": null,
			"seed": 1335916306,
			"version": 27,
			"versionNonce": 800324046,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "CXE01kC3"
				}
			],
			"updated": 1786847258388,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "CXE01kC3",
			"type": "text",
			"x": 1298.6781339659146,
			"y": 976.296682731184,
			"width": 286,
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
			"index": "a055",
			"roundness": null,
			"seed": 296505234,
			"version": 5,
			"versionNonce": 1433293906,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847244449,
			"locked": false,
			"text": "If the worst move that\nmade it into the engine\nlist is already too bad,\na candidate that did not\nmake the list must also\nbe too bad.\n\nIf the worst listed move\nis still within tolerance,\nthe missing candidate\nmight still be acceptable,\nso a deeper search is\nneeded.",
			"rawText": "If the worst move that\nmade it into the engine\nlist is already too bad,\na candidate that did not\nmake the list must also\nbe too bad.\n\nIf the worst listed move\nis still within tolerance,\nthe missing candidate\nmight still be acceptable,\nso a deeper search is\nneeded.",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "9RYR7GpN",
			"originalText": "If the worst move that\nmade it into the engine\nlist is already too bad,\na candidate that did not\nmake the list must also\nbe too bad.\n\nIf the worst listed move\nis still within tolerance,\nthe missing candidate\nmight still be acceptable,\nso a deeper search is\nneeded.",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "EpymV4pLoxg0b4tubZeMC",
			"type": "rectangle",
			"x": 305.12924603429906,
			"y": -68.57431588728605,
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
			"index": "a056",
			"roundness": null,
			"seed": 2099643534,
			"version": 484,
			"versionNonce": 1928613650,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "oBNdoZaa"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "oBNdoZaa",
			"type": "text",
			"x": 315.7568791793031,
			"y": -58.53909756861742,
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
			"index": "a057",
			"roundness": null,
			"seed": 2068988622,
			"version": 286,
			"versionNonce": 293379282,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "s2",
			"rawText": "s2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "EpymV4pLoxg0b4tubZeMC",
			"originalText": "s2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "xkSA1Tth",
			"type": "text",
			"x": 363.9768102276646,
			"y": -57.65387129625742,
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
			"index": "a058",
			"roundness": null,
			"seed": 1574746382,
			"version": 318,
			"versionNonce": 1563767442,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
			"id": "Lvydx5T4XZKbwzwfSCLh8",
			"type": "rectangle",
			"x": 304.89779537777576,
			"y": -10.49087287919383,
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
			"index": "a059",
			"roundness": null,
			"seed": 1816029006,
			"version": 517,
			"versionNonce": 1490358354,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "BnZWqlA1"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "BnZWqlA1",
			"type": "text",
			"x": 315.5254285227798,
			"y": -0.45565456052520403,
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
			"index": "a060",
			"roundness": null,
			"seed": 382750094,
			"version": 269,
			"versionNonce": 406009362,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "c2",
			"rawText": "c2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "Lvydx5T4XZKbwzwfSCLh8",
			"originalText": "c2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "I2skCKFa",
			"type": "text",
			"x": 370.52573070307176,
			"y": 1.6648954200813932,
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
			"index": "a061",
			"roundness": null,
			"seed": 1523280846,
			"version": 285,
			"versionNonce": 474391506,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
			"id": "YO6cxVxGRUtcNsGF_YJlo",
			"type": "rectangle",
			"x": 305.5571965157776,
			"y": 45.33611233464353,
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
			"index": "a062",
			"roundness": null,
			"seed": 642302478,
			"version": 553,
			"versionNonce": 791042450,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "O6mL5KTV"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "O6mL5KTV",
			"type": "text",
			"x": 316.18482966078165,
			"y": 55.37133065331216,
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
			"index": "a063",
			"roundness": null,
			"seed": 1010913358,
			"version": 269,
			"versionNonce": 1074354002,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "f3",
			"rawText": "f3",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "YO6cxVxGRUtcNsGF_YJlo",
			"originalText": "f3",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "ZKWysAr35HX-KLL2X7C0j",
			"type": "rectangle",
			"x": 306.764533361933,
			"y": 103.01399082060357,
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
			"index": "a064",
			"roundness": null,
			"seed": 411965070,
			"version": 610,
			"versionNonce": 1061592338,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "vYl2I28c"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "vYl2I28c",
			"type": "text",
			"x": 317.39216650693703,
			"y": 113.0492091392722,
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
			"seed": 1407718606,
			"version": 278,
			"versionNonce": 2052401874,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "v3",
			"rawText": "v3",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "ZKWysAr35HX-KLL2X7C0j",
			"originalText": "v3",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "XKtQPk3H",
			"type": "text",
			"x": 365.17067889929217,
			"y": 55.137552293008866,
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
			"index": "a066",
			"roundness": null,
			"seed": 132664078,
			"version": 292,
			"versionNonce": 2009858194,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
			"id": "Tx0tQwPT",
			"type": "text",
			"x": 370.11906549803257,
			"y": 116.7806869799274,
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
			"index": "a067",
			"roundness": null,
			"seed": 856144206,
			"version": 260,
			"versionNonce": 1398939218,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
			"id": "G3NpMjmEJDV5YQNu6uA9s",
			"type": "rectangle",
			"x": 309.06624550115174,
			"y": 161.31122022439126,
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
			"index": "a068",
			"roundness": null,
			"seed": 480206734,
			"version": 631,
			"versionNonce": 435061778,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "qZGPylqz"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "qZGPylqz",
			"type": "text",
			"x": 319.6938786461558,
			"y": 171.3464385430599,
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
			"seed": 954744270,
			"version": 301,
			"versionNonce": 627585490,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "z2",
			"rawText": "z2",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "G3NpMjmEJDV5YQNu6uA9s",
			"originalText": "z2",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "EEv9yXPj",
			"type": "text",
			"x": 368.57910685339243,
			"y": 175.73951495468896,
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
			"index": "a070",
			"roundness": null,
			"seed": 217797646,
			"version": 246,
			"versionNonce": 2028349330,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
			"id": "fOkz5NQRPw0pDkaAu2rJl",
			"type": "rectangle",
			"x": 307.8564836225599,
			"y": 218.13416872128687,
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
			"index": "a071",
			"roundness": null,
			"seed": 315728462,
			"version": 682,
			"versionNonce": 480208210,
			"isDeleted": false,
			"boundElements": [
				{
					"type": "text",
					"id": "Mok1jqxk"
				}
			],
			"updated": 1786847253371,
			"link": null,
			"locked": false,
			"hasTextLink": false
		},
		{
			"id": "Mok1jqxk",
			"type": "text",
			"x": 318.48411676756393,
			"y": 228.1693870399555,
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
			"index": "a072",
			"roundness": null,
			"seed": 491006094,
			"version": 356,
			"versionNonce": 2045438738,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
			"locked": false,
			"text": "g1",
			"rawText": "g1",
			"fontSize": 20,
			"fontFamily": 8,
			"textAlign": "center",
			"verticalAlign": "middle",
			"containerId": "fOkz5NQRPw0pDkaAu2rJl",
			"originalText": "g1",
			"autoResize": true,
			"lineHeight": 1.25,
			"hasTextLink": false,
			"link": null
		},
		{
			"id": "OIckvHBD",
			"type": "text",
			"x": 363.62010309568893,
			"y": 227.82862776261175,
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
			"index": "a073",
			"roundness": null,
			"seed": 1007412942,
			"version": 213,
			"versionNonce": 926922962,
			"isDeleted": false,
			"boundElements": [],
			"updated": 1786847253371,
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
		"currentItemBackgroundColor": "#fff5f5",
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
		"scrollX": 1044.6192623413094,
		"scrollY": 208.73075152283235,
		"zoom": {
			"value": 0.297282
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