# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bow-wow is a 3D boat hull designer for creating 3D-printable boat hulls. It's a React + TypeScript web application that uses Three.js (via React Three Fiber) for 3D visualization. Users can design hulls that fit diagonally on a square build plate, adjust parameters via sliders, and export to STL for 3D printing.

## Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - TypeScript check + production build
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## Architecture

**Core data flow:**
- `App.tsx` owns the `BoatParams` state and calculates derived values (max length, waterline height)
- `ControlPanel` renders sliders that modify params
- `Viewer3D` renders the 3D scene with React Three Fiber
- `HullMesh` generates BufferGeometry for the hull from params

**Key modules:**
- `src/types/boatParams.ts` - Parameter interface, defaults, save/load versioning
- `src/components/HullMesh.tsx` - Procedural hull geometry generation using indexed BufferGeometry with 16 points per cross-section (8 outer + 8 inner for wall thickness)
- `src/utils/physics.ts` - Buoyancy calculations (waterline height via bisection search, displaced volume, PLA mass)
- `src/utils/stlExport.ts` - Binary STL export from Three.js geometry
- `src/utils/fileOperations.ts` - JSON save/load with version migration

**Hull geometry structure:**
The hull is generated as cross-sections along Z-axis (boat length). Each section has 8 outer points and 8 inner points forming a U-shape profile. Stern has constant cross-section, bow tapers to a point. Faces connect adjacent sections. The stern and bow tip require explicit closure faces.

**Coordinate system:**
- X: beam (width, left/right)
- Y: height (up)
- Z: length (stern at -Z, bow at +Z)

## Bow Types

The hull supports three bow types:
- **Plumb**: Standard vertical bow that tapers to a point
- **Raked**: Bow leans forward as it goes up, controlled by `bowRakeAngle`
- **Deep V**: Sharp V-shaped entry below waterline, controlled by `bowEntryAngle`
