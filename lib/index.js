'use strict';

const React = require('react');
const T = require('prop-types');
const { Switch, Route, Redirect } = require('react-router-dom');
const { logDOM } = require('@testing-library/dom');

const { cloneElement } = React;

const internals = {};

exports.Routes = function Routes(props) {

    const { routes, onUpdate } = props;
    const { keyForRoute, renderRoute } = internals;

    const renderBase = renderRoute('/', onUpdate);

    if (Array.isArray(routes)) {
        return (
            <Switch>
                {routes.map(renderBase).map((route) => {

                    return cloneElement(route, { key: keyForRoute(route) });
                })}
            </Switch>
        );
    }

    return renderBase(routes);
};

// Recursive prop-types strategy grabbed from
// https://github.com/facebook/react/issues/5676#issuecomment-739092902
// eslint-disable-next-line @hapi/scope-start, prefer-spread
const routeType = (...args) => T.shape({
    path: T.string,
    exact: T.bool,
    strict: T.bool,
    sensitive: T.bool,
    component: T.any,
    pre: T.func,
    fallback: T.any,
    wrapFallbackWithComponent: T.bool,
    redirect: T.shape({
        from: T.string,
        to: T.string
    }),
    childRoutes: T.arrayOf(routeType)
}).apply(null, args);

exports.Routes.propTypes = {
    routes: T.oneOfType([
        routeType,
        T.arrayOf(routeType)
    ]).isRequired,
    onUpdate: T.func
};

internals.keyForRoute = (route) => {

    return String(
        route.path
        + String(route.props)
        + !!route.exact
        + !!route.strict
        + !!route.sensitive
        + !!route.childRoutes
    );
};

internals.handleRedirect = function HandleRedirect(basePath, route) {

    const { concatPaths } = internals;

    // Redirect is special and must be exclusive of other props
    const { redirect, ...rest } = route;

    if (Object.keys(rest).length !== 0) {
        throw new Error(`No other properties are allowed alongside "redirect" in route configuration. Check childRoutes of "${basePath}".`);
    }

    const { from, to } = redirect;
    const redirectProps = { ...redirect };

    if (typeof from === 'string') {
        // redirect.from must be relative
        redirectProps.from = concatPaths(basePath, from);
    }

    if (typeof to === 'string') {
        // If redirect.to is absolute, leave it be. Otherwise make it relative
        redirectProps.to = to.startsWith('/') ? to : concatPaths(basePath, to);
    }
    else if (to && typeof to.pathname === 'string') {
        // to is an object
        redirectProps.to = {
            ...redirectProps.to,
            pathname: to.pathname.startsWith('/') ? to.pathname : concatPaths(basePath, to.pathname)
        };
    }

    return <Redirect {...redirectProps} />;
};

internals.renderRoute = function RenderPath(basePath, onUpdate) {

    return function RenderRoute(route) {

        const {
            handleRedirect,
            concatPaths,
            renderRoute,
            keyForRoute,
            RouteComponentLifecycleWrapper
        } = internals;

        if (route.redirect) {
            return handleRedirect(basePath, route);
        }

        const {
            path,
            exact,
            strict,
            sensitive,
            component: RouteComponent,
            wrapFallbackWithComponent
        } = route;

        const normalizedPath = concatPaths(basePath, path);
        // 'renderRouteFromPath' — It's a recursion excursion.`
        const renderRouteFromPath = renderRoute(normalizedPath, onUpdate);

        return (
            <Route
                key={normalizedPath}
                path={normalizedPath}
                exact={exact}
                strict={strict}
                sensitive={sensitive}
                render={(props) => {

                    const routerProps = {
                        ...props,
                        ...route.props,
                        route,
                        normalizedPath
                    };

                    const render = function Render(renderProps) {

                        const componentProps = { ...routerProps, ...renderProps };

                        if (onUpdate) {
                            onUpdate(componentProps);
                        }

                        return (
                            <RouteComponent {...componentProps}>
                                {route.childRoutes && (
                                    <Switch>
                                        {route.childRoutes.map(renderRouteFromPath).map((routeEl) => {

                                            return cloneElement(routeEl, { key: keyForRoute(routeEl.props) });
                                        })}
                                    </Switch>
                                )}
                            </RouteComponent>
                        );
                    };

                    if (RouteComponentLifecycleWrapper.isTrivialRoute(route)) {
                        return render();
                    }

                    const renderFallback = function RenderFallback(renderProps) {

                        const Fallback = route.fallback || (route.props ? route.props.fallback : null) || null;

                        const componentProps = { ...routerProps, ...renderProps };

                        if (Fallback) {
                            return !wrapFallbackWithComponent ? <Fallback {...componentProps} /> : (
                                <RouteComponent {...componentProps}>
                                    <Fallback {...componentProps} />
                                </RouteComponent>
                            );
                        }

                        return null;
                    };

                    return (
                        <RouteComponentLifecycleWrapper
                            route={route}
                            routerProps={routerProps}
                            // eslint-disable-next-line react/jsx-no-bind
                            render={render}
                            // eslint-disable-next-line react/jsx-no-bind
                            renderFallback={renderFallback}
                        />
                    );
                }}
            />
        );
    };
};

const { useEffect, useState, useRef } = React;

internals.RouteComponentLifecycleWrapper = function RouteComponentLifecycleWrapper(props) {

    // Freeze props to avoid rerender bugs
    const propsSnapshotRef = useRef();
    useEffect(() => {

        propsSnapshotRef.current = props;
    });

    const [isPreResolved, setIsPreResolved] = useState(false);

    useEffect(() => {

        const { route, routerProps } = propsSnapshotRef.current;

        let {
            onMount,
            onUnmount
        } = route;

        const noop = () => null;

        onMount = onMount || noop;
        onUnmount = onUnmount || noop;

        const runPre = async (func) => {

            await func(routerProps);
            onMount(routerProps);
            setIsPreResolved(true);
        };

        const { pre } = route;

        if (pre) {
            runPre(pre);
        }
        else {
            onMount(routerProps);
            setIsPreResolved(true);
        }

        return function cleanup() {

            onUnmount(routerProps);
        };
    }, [setIsPreResolved]);

    // We know these 2 funcs specifically won't change over time
    const { renderFallback, render, ...rest } = props;

    return !isPreResolved ? renderFallback(rest) : render(rest);
};

internals.RouteComponentLifecycleWrapper.propTypes = {
    route: T.object.isRequired
};

internals.RouteComponentLifecycleWrapper.isTrivialRoute = (route) => {

    if (!route) {
        return true;
    }

    return !route.pre && !route.onMount && !route.onUnmount;
};

internals.concatPaths = (base, path) => {

    base = base.endsWith('/') ? base.slice(0, -1) : base; // /my-path/ -> /my-path
    path = path.startsWith('/') ? path.slice(1) : path;   // /my-path -> my-path

    return `${base}/${path}`;
};


// ========== The original idea — an attempt to write on top of the API ======


// const React = require('react');

// const { useHistory, useRouteMatch, useParams } = require('react-router-dom');

// const { useState, useEffect, cloneElement } = React;

// const internals = {};

// module.exports = function StrangeRouterV3Shim(route) {

//     const {
//         path,
//         component: RouteComponent,
//         fallback,
//         wrapFallbackWithComponent,
//         props: routeProps,
//         childRoutes
//     } = route;

//     const { RouteComponentLifecycleWrapper } = internals;

//     const routerProps = {
//         ...routeProps,
//         ...route.props,
//         route
//     };

//     // eslint-disable-next-line
//     const render = function Render(props) {

//         const extraProps = {
//             history: useHistory(),
//             params: useParams(),
//             match: useRouteMatch(location.pathname)
//         };

//         return (
//             <RouteComponent
//                 {...routerProps}
//                 {...extraProps}
//                 {...props}
//             />
//         );
//     };

//     if (RouteComponentLifecycleWrapper.isTrivialRoute(route)) {
//         return {
//             path,
//             component: render,
//             exact: route.exact,
//             childRoutes: childRoutes ? childRoutes.map(module.exports) : undefined
//         };
//     }

//     const renderFallback = function RenderFallback(props) {

//         const extraProps = {
//             ...props,
//             history: useHistory(),
//             params: useParams(),
//             match: useRouteMatch(location.pathname)
//         };

//         const Fallback = fallback || (routeProps ? routeProps.fallback : null) || null;

//         if (Fallback) {
//             return !wrapFallbackWithComponent ? <Fallback {...routerProps} {...extraProps} /> : (
//                 <RouteComponent { ...routerProps } {...extraProps}>
//                     <Fallback {...routerProps} {...extraProps} />
//                 </RouteComponent>
//             );
//         }

//         return <RouteComponent {...routerProps} {...extraProps} />;
//     };

//     return {
//         path,
//         exact: route.exact,
//         component: function RouteLifecycleComponent(props) {

//             return (
//                 <RouteComponentLifecycleWrapper
//                     {...props}
//                     route={route}
//                     routerProps={routerProps}
//                     render={render}
//                     renderFallback={renderFallback}
//                 />
//             );
//         },
//         childRoutes: childRoutes ? childRoutes.map(module.exports) : undefined
//     };
// };

// internals.RouteComponentLifecycleWrapper = function RouteComponentLifecycleWrapper(props) {

//     const { route, routerProps, render, renderFallback } = props;

//     let {
//         onMount,
//         onUnmount
//     } = route;

//     const noop = () => null;

//     onMount = onMount || noop;
//     onUnmount = onUnmount || noop;

//     const [isPreResolved, setIsPreResolved] = useState(false);

//     const extraProps = {
//         history: useHistory(),
//         params: useParams(),
//         match: useRouteMatch(location.pathname)
//     };

//     useEffect(() => {

//         const runPre = async (func) => {

//             await func({ ...routerProps, ...extraProps });
//             onMount(routerProps);
//             setIsPreResolved(true);
//         };

//         const { pre } = route;

//         if (pre) {
//             runPre(pre);
//         }
//         else {
//             onMount(routerProps);
//             setIsPreResolved(true);
//         }

//         return function cleanup() {

//             onUnmount(routerProps);
//         };
//     }, []);

//     return !isPreResolved ? renderFallback(props) : render(props);
// };

// internals.RouteComponentLifecycleWrapper.isTrivialRoute = (route) => {

//     if (!route) {
//         return true;
//     }

//     return !route.pre && !route.onMount && !route.onUnmount;
// };

// internals.cloneWithProps = (element, props) => {

//     if (!element) {
//         return null;
//     }

//     return cloneElement(element, props);
// };












// 'use strict';

// const React = require('react');
// const T = require('prop-types');
// const { Switch, Route, Redirect } = require('react-router');
// const { logDOM } = require('@testing-library/dom');

// const internals = {};

// // TODO
// // Make 'Routes' support an 'onUpdate' prop

// exports.Routes = function Routes(props) {

//     const { routes } = props;

//     if (!routes) {
//         return null;
//     }

//     const { keyForRoute, renderRoute, cloneWithProps } = internals;

//     const renderBase = renderRoute('/');

//     if (Array.isArray(routes)) {
//         return (
//             <Switch>
//                 {routes.map(renderBase).map((route) => {

//                     return cloneWithProps(route, { key: keyForRoute(route) });
//                 })}
//             </Switch>
//         );
//     }

//     return renderBase(routes);
// };

// exports.Routes.propTypes = {
//     routes: T.oneOfType([
//         T.object,
//         T.arrayOf(T.object)
//     ]).isRequired
// };

// // exports.concatPaths = (base, path) => {

// //     const normalize = (str) => {

// //         return str
// //             .replace(/\/+/g, '/') // Dedupe slashes
// //             .replace(/^\//, '') // Remove starting slash
// //             .replace(/\/$/, ''); // Remove trailing slash
// //     };

// //     // Default to '/'
// //     return normalize(`${normalize(base)}/${normalize(path)}`) || '/';
// // };

// exports.concatPaths = (base, path) => {

//     base = base.endsWith('/') ? base.slice(0, -1) : base; // /my-path/ -> /my-path
//     path = path.startsWith('/') ? path.slice(1) : path;   // /my-path -> my-path

//     return `${base}/${path}`;
// };

// internals.keyForRoute = (route) => {

//     return String(
//         route.path
//         + String(route.props)
//         + !!route.exact
//         + !!route.strict
//         + !!route.sensitive
//         + !!route.childRoutes
//     );
// };

// internals.cloneWithProps = (element, props) => {

//     if (!element) {
//         return null;
//     }

//     return React.cloneElement(element, props);
// };

// internals.handleRedirect = function HandleRedirect(basePath, route) {

//     // Redirect is special and must be exclusive of other props
//     const { redirect, ...rest } = route;

//     if (Object.keys(rest).length !== 0) {
//         throw new Error(`No other properties are allowed alongside "redirect" in route configuration. Check childRoutes of "${basePath}".`);
//     }

//     const { from, to } = redirect;
//     const redirectProps = { ...redirect };

//     if (typeof from === 'string') {
//         // redirect.from must be relative
//         redirectProps.from = exports.concatPaths(basePath, from);
//     }

//     if (typeof to === 'string') {
//         // If redirect.to is absolute, leave it be. Otherwise make it relative
//         redirectProps.to = to.startsWith('/') ? to : exports.concatPaths(basePath, to);
//     }
//     else if (to && typeof to.pathname === 'string') {
//         // to is an object
//         redirectProps.to = {
//             ...redirectProps.to,
//             pathname: to.pathname.startsWith('/')
//                 ? to.pathname
//                 : exports.concatPaths(basePath, to.pathname)
//         };
//     }

//     return <Redirect {...redirectProps} />;
// };

// internals.renderRoute = function RenderPath(basePath) {

//     return function RenderRoute(route) {

//         const { handleRedirect } = internals;

//         if (route.redirect) {
//             return handleRedirect(basePath, route);
//         }

//         const {
//             path,
//             exact,
//             strict,
//             sensitive,
//             component: RouteComponent,
//             wrapFallbackWithComponent
//         } = route;

//         const normalizedPath = exports.concatPaths(basePath, path);
//         const renderRouteFromPath = internals.renderRoute(normalizedPath);

//         const {
//             RouteComponentLifecycleWrapper,
//             cloneWithProps,
//             keyForRoute
//         } = internals;

//         return (
//             <Route
//                 key={normalizedPath}
//                 path={normalizedPath}
//                 exact={exact}
//                 strict={strict}
//                 sensitive={sensitive}
//                 render={(props) => {

//                     const routerProps = {
//                         ...props,
//                         ...route.props,
//                         route,
//                         normalizedPath
//                     };

//                     const render = function Render(renderProps) {

//                         const componentProps = { ...routerProps, ...renderProps };

//                         return (
//                             <RouteComponent {...componentProps}>
//                                 {route.childRoutes && (
//                                     <Switch>
//                                         {route.childRoutes.map(renderRouteFromPath).map((routeComponent) => {

//                                             console.log('routeComponent', routeComponent);
//                                             return cloneWithProps(routeComponent, { key: keyForRoute(routeComponent.props.route) });
//                                         })}
//                                     </Switch>
//                                 )}
//                             </RouteComponent>
//                         );
//                     };

//                     if (RouteComponentLifecycleWrapper.isTrivialRoute(route)) {
//                         return render();
//                     }

//                     const renderFallback = function RenderFallback(renderProps) {

//                         const Fallback = route.fallback || (route.props ? route.props.fallback : null) || null;

//                         const componentProps = { ...routerProps, ...renderProps };

//                         if (Fallback) {
//                             return !wrapFallbackWithComponent ? <Fallback {...componentProps} /> : (
//                                 <RouteComponent {...componentProps}>
//                                     <Fallback {...componentProps} />
//                                 </RouteComponent>
//                             );
//                         }

//                         return <RouteComponent {...routerProps} />;
//                     };

//                     return (
//                         <RouteComponentLifecycleWrapper
//                             route={route}
//                             routerProps={routerProps}
//                             // eslint-disable-next-line react/jsx-no-bind
//                             render={render}
//                             // eslint-disable-next-line react/jsx-no-bind
//                             renderFallback={renderFallback}
//                         />
//                     );
//                 }}
//             />
//         );
//     };
// };

// const { useEffect, useState, useRef } = React;

// internals.RouteComponentLifecycleWrapper = function RouteComponentLifecycleWrapper(props) {

//     // Freeze props to avoid rerender bugs
//     const propsSnapshotRef = useRef();
//     useEffect(() => {

//         propsSnapshotRef.current = props;
//     });

//     const [isPreResolved, setIsPreResolved] = useState(false);

//     useEffect(() => {

//         const { route, routerProps } = propsSnapshotRef.current;

//         let {
//             onMount,
//             onUnmount
//         } = route;

//         const noop = () => null;

//         onMount = onMount || noop;
//         onUnmount = onUnmount || noop;

//         const runPre = async (func) => {

//             await func(routerProps);
//             onMount(routerProps);
//             setIsPreResolved(true);
//         };

//         const { pre } = route;

//         if (pre) {
//             runPre(pre);
//         }
//         else {
//             onMount(routerProps);
//             setIsPreResolved(true);
//         }

//         return function cleanup() {

//             onUnmount(routerProps);
//         };
//     }, [setIsPreResolved]);

//     // We know these 2 funcs specifically won't change over time
//     const { renderFallback, render, ...rest } = props;

//     return !isPreResolved ? renderFallback(rest) : render(rest);
// };

// internals.RouteComponentLifecycleWrapper.propTypes = {
//     route: T.object.isRequired
// };

// internals.RouteComponentLifecycleWrapper.isTrivialRoute = (route) => {

//     if (!route) {
//         return true;
//     }

//     return !route.pre && !route.onMount && !route.onUnmount;
// };
