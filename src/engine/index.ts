/** Façade publique du moteur : importez depuis '@engine'. */
export { Game, type EngineEvents, type GameOptions } from './core/Game';
export { FixedLoop } from './core/FixedLoop';
export { EventBus } from './core/EventBus';
export { World, defineComponent, SystemPriority, type Entity, type System, type ComponentType } from './ecs/World';
export * from './ecs/components';
export { Vec2, dist, dist2, lerp, clamp, damp, type Vec2Like } from './math/Vec2';
export { Rng } from './math/Rng';
export { SpatialHash } from './physics/SpatialHash';
export { circleCircle, circleRect, pointInRect, type Circle, type Rect, type Manifold } from './physics/shapes';
export { MovementSystem, PhysicsSystem, type Contact } from './physics/PhysicsSystem';
export { Camera } from './camera/Camera';
export { Input, type Device } from './input/Input';
export { DEFAULT_BINDINGS, type Action, type Binding, type Bindings } from './input/bindings';
export { AssetStore } from './assets/AssetStore';
export { Renderer, WORLD_LAYERS, SCREEN_LAYERS, type WorldLayer, type ScreenLayer } from './render/Renderer';
export { View, attachView, installViewCleanup, syncViews, type ViewC } from './render/View';
export { Scene, SceneManager } from './scene/Scene';
