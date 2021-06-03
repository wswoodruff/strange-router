'use strict';

const React = require('react');
const T = require('prop-types');
const { Switch, Route, Redirect } = require('react-router-dom');

const { cloneElement } = React;

const internals = {};

const ROOT_PATH = '/';
const DEFAULT_REDIRECT = '/404';

exports.Routes = function Routes(props) {

    const { routes, defaultRedirect, debug } = props;

    let { onUpdate } = props;

    onUpdate = onUpdate || ((x) => x);

    const {
        keyForRoute,
        renderRoute,
        cloneWithKeys,
        markFamily,
        parseRoutes,
        logRouteConfig
    } = internals;

    const routesWithMarkedParents = markFamily([].concat(routes));

    const decoratedRoutes = parseRoutes({
        basePath: ROOT_PATH,
        routes: routesWithMarkedParents,
        defaultRedirect,
        onUpdate
    });

    if (debug) {
        logRouteConfig(decoratedRoutes);
    }

    if (!decoratedRoutes) {
        return null;
    }

    const renderBase = renderRoute({ routes: decoratedRoutes, basePath: ROOT_PATH, onUpdate });

    return (
        <Switch>
            {cloneWithKeys({
                items: decoratedRoutes.map(renderBase),
                keyGetter: (route) => keyForRoute(route)
            })}
        </Switch>
    );
};

// Recursive prop-types strategy grabbed from
// https://github.com/facebook/react/issues/5676#issuecomment-739092902
// eslint-disable-next-line @hapi/scope-start, prefer-spread
const routeType = (...args) => T.shape({
    path: T.string,
    strict: T.bool,
    sensitive: T.bool,
    component: T.any,
    pre: T.func,
    fallback: T.any,
    props: T.object,
    wrapFallbackWithComponent: T.bool,
    redirect: T.shape({
        from: T.string,
        to: T.string
    }),
    childRoutes: T.arrayOf(routeType),
    defaultRedirect: T.string
}).apply(null, args);

exports.Routes.propTypes = {
    routes: T.oneOfType([
        routeType,
        T.arrayOf(routeType)
    ]).isRequired,
    onUpdate: T.func,
    defaultRedirect: T.string
};

internals.isRootPath = (path) => path === ROOT_PATH;

internals.logRouteConfig = (routes) => {

    const jsonSafe = ({ ...route }) => {

        route.parentRoute = route.parentRoute?.path;
        route.component = String(route.component);

        if (route.childRoutes) {
            route.childRoutes = route.childRoutes.map(jsonSafe);
        }

        return route;
    };

    console.log('StrangeRouter: debug:', JSON.stringify(routes.map(jsonSafe), null, 4));
};

// TODO re-mark family after consolidating root path routes and such.
internals.markFamily = (routes) => {

    const { getUniqueRouteId, getRootRoute } = internals;

    return routes.map((route) => {

        if (!route.parentRoute) {
            // Set the root parent route
            route.parentRoute = getRootRoute(routes);
        }

        route.id = getUniqueRouteId(route);

        // Ooh. fancy.
        route.siblingRoutes = routes.filter((rt) => rt.id !== route.id);

        if (route.childRoutes) {
            route.childRoutes = internals.markFamily(
                route.childRoutes.map((childRoute) => ({
                    ...childRoute,
                    parentRoute: route
                }))
            );
        }

        return route;
    });
};

internals.getRootRoute = (routes) => {

    return {
        isRoot: true,
        childRoutes: routes
    };
};

internals.parseRoutes = ({ routes, onUpdate, basePath = ROOT_PATH, defaultRedirect = DEFAULT_REDIRECT }) => {

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
        return null;
    }

    const {
        concatPaths,
        parseRoutes,
        isFallbackRedirect,
        lastChild,
        getUniqueRouteId,
        RouteComponentLifecycleWrapper,
        trivialRender
    } = internals;

    // Setup fallback redirects
    if (!isFallbackRedirect(lastChild(routes))) {

        routes.push({
            id: getUniqueRouteId(),
            redirect: {
                // The secret sauce
                to: lastChild(routes[0].parentRoute.siblingRoutes)?.redirect?.to ?? defaultRedirect
            }
        });
    }

    routes = routes.map((route) => {

        route.basePath = basePath;

        route.fullPath = concatPaths(
            basePath,
            isFallbackRedirect(route) ? defaultRedirect : (route.path || '')
        );

        route.props = route.props || {};

        // StrangeRouter automatically manages setting "exact" for routes based on configuration.
        if (route.childRoutes) {
            route.exact = false;
        }

        // There are special considerations for routes with ROOT_PATH.

        // Set exact: true for routes that have ROOT_PATH.
        // These routes should only be used for rendering at the parent route's exact path or at root ROOT_PATH.
        // This also ensures other routes don't get 'hidden' by ROOT_PATH stealing the route match in <Switch>.
        // After this round of decorations we'll mutate the config to account for root paths and their children.
        if (route.path === ROOT_PATH) {
            route.exact = true;
        }

        if (route.childRoutes) {
            route.childRoutes = (
                parseRoutes({
                    routes: route.childRoutes,
                    onUpdate,
                    basePath: concatPaths(basePath, route.path)
                })
            );
        }

        return route;
    });

    ///////////////// BEGIN consolidateRootRoutes

    // const isRootPathWithChildren = (route) => route.path === ROOT_PATH && route.childRoutes;

    // const consolidateRootRoutes = (route) => {

    //     if (!route.childRoutes) {
    //         return route;
    //     }

    //     if (isRootPathWithChildren(route)) {
    //         route.childRoutes = route.childRoutes.map((childRoute) => {

    //             const renderRouteFromBase = renderRoute({
    //                 routes,
    //                 basePath: normalizedPath,
    //                 onUpdate
    //             });

    //             if (RouteComponentLifecycleWrapper.isTrivialRoute(route)) {
    //                 return trivialRender({
    //                     onUpdate
    //                     //         renderRoute: renderRouteFromBase,
    //                     //         normalizedPath,
    //                                RouteComponent,
    //                     //         ...routerProps
    //                     //     });
    //                     // };
    //                 });
    //             }
    //             // trivialRender({
    //             //     onUpdate,
    //             //     renderRoute: renderRouteFromBase,
    //             //     normalizedPath,
    //             //     ...routerProps
    //             // });

    //             if (isRootPathWithChildren(childRoute)) {
    //                 return consolidateRootRoutes(childRoute);
    //             }

    //             return childRoute;
    //         });
    //     }

    //     return route;

    //     //
    //     //
    //     // Wrap with the lifecycle wrapper if it's not trivial — wrap it that way
    // };

    // routes = routes.map(consolidateRootRoutes);

    // const rootPathWithChildren = isRootPathWithChildren(routes);

    // if (rootPathWithChildren) {

    //     const { childRoutes: newSiblings, ...rootPathConfig } = rootPathWithChildren;

    //     // TODO maybe we wrap the siblings in the root path component — then it would at least work how they wrote it.
    //     // Maybe we don't show a warning if that happens, maybe that's just an implementation detail we keep hidden.
    //     routes = [
    //         // rootPathRoute,
    //         // Add new siblings, remove any fallbacks
    //         ...newSiblings
    //             .filter((route) => !isFallbackRedirect(route))
    //             .map((route) => {

    //                 return {
    //                     ...route,
    //                     ...rootPathConfig
    //                 };
    //             }),
    //         ...routes.filter((route) => route.path !== ROOT_PATH)
    //     ];
    // }

    ///////////////// END consolidateRootRoutes

    return routes;
};

internals.isFallbackRedirect = ({ redirect: { to, from } = {} } = {}) => to && !from;

internals.cloneWithKeys = ({ items, keyGetter }) => {

    return items.map((item) => {

        if (!item) {
            return null;
        }

        return cloneElement(item, { key: keyGetter(item) });
    });
};

internals.keyForRoute = (route) => {

    if (!route) {
        return null;
    }

    return String(
        route.path
        + String(route.props)
        + !!route.strict
        + !!route.sensitive
        + !!route.childRoutes
    );
};

internals.handleRedirect = function HandleRedirect(route) {

    const { concatPaths } = internals;

    // Redirect is special and must be exclusive of other props
    let { redirect: { from, to } } = route;
    const { basePath } = route;

    if (typeof from === 'string') {
        // redirect.from must be relative
        from = concatPaths(basePath, from);
    }

    if (typeof to === 'string') {
        // If redirect.to is absolute, leave it be. Otherwise make it relative
        to = to.startsWith(ROOT_PATH) ? to : concatPaths(basePath, to);
    }
    else if (to && typeof to.pathname === 'string') {
        // to is an object
        to = {
            ...to,
            pathname: to.pathname.startsWith(ROOT_PATH) ? to.pathname : concatPaths(basePath, to.pathname)
        };
    }

    return <Redirect from={from} to={to} />;
};

internals.renderRoute = function RenderPath({ routes, basePath, onUpdate }) {

    return function RenderRoute(route) {

        const {
            handleRedirect,
            concatPaths,
            renderRoute,
            RouteComponentLifecycleWrapper,
            lastChild,
            findMatchingChildPath,
            findClosestMatchingChildPath,
            trivialRender,
            renderWithFallback
        } = internals;

        if (!route) {
            return null;
        }

        const {
            path,
            exact, // Automatically managed by StrangeRouter
            strict,
            sensitive,
            component: RouteComponent
        } = route;

        if (!route) {
            return null;
        }

        const normalizedPath = concatPaths(basePath, path);

        const renderRouteFromBase = renderRoute({
            routes,
            basePath: normalizedPath,
            onUpdate
        });

        return (
            <Route
                path={normalizedPath}
                exact={exact}
                strict={strict}
                sensitive={sensitive}
                render={(props) => {

                    if (route.redirect) {
                        return handleRedirect(route);
                    }

                    // Catch redirects early on by searching routeChildren.
                    // Then use the fallback redirect for the closest matching route.
                    // NOTE The existing 'route' can also be returned from 'findMatchingChildPath'.
                    const foundChildMatch = findMatchingChildPath(route, props.location.pathname);

                    if (!foundChildMatch) {
                        const closestMatch = findClosestMatchingChildPath(route, props.location.pathname);

                        if (closestMatch) {
                            // Thanks to 'internals.parseRoutes', we know the last child of
                            // each childRoutes list is a fallback redirect.
                            if (closestMatch.childRoutes) {
                                return handleRedirect(lastChild(closestMatch.childRoutes));
                            }

                            return handleRedirect(lastChild(closestMatch.parentRoute.childRoutes));
                        }
                    }

                    if (!route || !path || !RouteComponent) {
                        return null;
                    }

                    const routerProps = {
                        ...props,
                        route
                    };

                    const render = () => {

                        return trivialRender({
                            onUpdate,
                            renderRoute: renderRouteFromBase,
                            normalizedPath,
                            RouteComponent,
                            ...routerProps
                        });
                    };

                    if (RouteComponentLifecycleWrapper.isTrivialRoute(route)) {
                        return render();
                    }

                    const renderFallback = () => {

                        return renderWithFallback({
                            RouteComponent,
                            ...routerProps
                        });
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

    let isMounted = false;
    useEffect(() => {

        isMounted = true;

        return () => {

            isMounted = false;
        };
    }, [isMounted]);

    const [isPreResolved, setIsPreResolved] = useState(false);

    useEffect(() => {

        const effectProps = propsSnapshotRef.current;

        const { route } = props;

        let {
            onMount,
            onUnmount
        } = route;

        const noop = () => null;

        onMount = onMount || noop;
        onUnmount = onUnmount || noop;

        const runPre = async (func) => {

            await func(effectProps);

            if (!isMounted) {
                return null;
            }

            onMount(effectProps);
            setIsPreResolved(true);
        };

        const { pre } = route;

        if (pre) {
            runPre(pre);
        }
        else {
            onMount(effectProps);
            setIsPreResolved(true);
        }

        return function cleanup() {

            onUnmount(effectProps);
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

internals.lastChild = (arr) => {

    if (!arr) {
        return;
    }

    return arr[arr.length - 1];
};

internals.sliceOffLastRouteFromPath = (str) => str.split(ROOT_PATH).slice(0, str.split(ROOT_PATH).length - 1).join(ROOT_PATH);

internals.concatPaths = (base, path) => {

    base = base || '';
    path = path || '';

    base = base.endsWith(ROOT_PATH) ? base.slice(0, -1) : base; // /my-path/ -> /my-path
    path = path.startsWith(ROOT_PATH) ? path.slice(1) : path;   // /my-path -> my-path

    return `${base}/${path}`;
};

internals.cleanupMultiline = (str) => str.replace(/\n/g, '').replace(/\s+/g, ' ');

internals.findMatchingChildPath = (route, matchPath) => {

    if (route.fullPath === matchPath) {
        return route;
    }

    if (!route.childRoutes) {
        return null;
    }

    return route.childRoutes.find((childRoute) => {

        return internals.findMatchingChildPath(childRoute, matchPath);
    });
};

internals.findClosestMatchingChildPath = (route, matchPath) => {

    if (!matchPath.startsWith(route.fullPath) || route.path === ROOT_PATH) {
        return false;
    }

    if (!route.childRoutes) {
        // This is the closest matching route
        return route;
    }

    const childMatch = route.childRoutes.find((childRoute) => matchPath.startsWith(childRoute.fullPath));

    if (!childMatch) {
        // This is the closest matching route
        return route;
    }

    return internals.findClosestMatchingChildPath(childMatch, matchPath);
};

// This is only used for assigning route ids at runtime.
// The chances of Date.now() combined with Math.random()
// Combined with route.path charCodes generating a duplicate id are ~0.
// We'll combine this with the fullPath for the route for good measure.
internals.getUniqueRouteId = (route) => {

    const { randomizeChainString } = internals;

    const now = Date.now();

    const rando = Math.round(Math.random() * now);
    const removeDecimal = (num) => String(num).replace(/\.+/, '');

    if (!route) {
        return removeDecimal(rando);
    }

    const pathFactor = randomizeChainString(route.path ?? (route.redirect?.from ?? '' + route.redirect?.to ?? ''));

    return removeDecimal(rando * pathFactor);
};

internals.randomizeChainString = (str) => {

    str = str.replace(/undefined|null/g, '');

    if (!str) {
        return String(Math.random()).replace('.', '');
    }

    return str
        .split('')
        .map((s) => s.charCodeAt(0))
        .join('');
};

internals.trivialRender = function TrivialRender(props) {

    const {
        route,
        onUpdate,
        renderRoute,
        normalizedPath,
        RouteComponent
    } = props;

    const {
        cloneWithKeys,
        keyForRoute
    } = internals;

    onUpdate(props);

    return (
        <RouteComponent {...props}>
            {route.childRoutes && (
                <Switch>
                    {cloneWithKeys({
                        items: [].concat(route.childRoutes).map(renderRoute),
                        keyGetter: (routeEl) => normalizedPath + keyForRoute(routeEl.props)
                    })}
                </Switch>
            )}
        </RouteComponent>
    );
};

internals.trivialRender.propTypes = {
    route: routeType,
    onUpdate: T.func.isRequired,
    renderRoute: T.func.isRequired,
    normalizedPath: T.string.isRequired
};

internals.renderWithFallback = function RenderFallback(props) {

    const {
        route,
        RouteComponent
    } = props;

    const { wrapFallbackWithComponent = false } = route;

    const Fallback = route.fallback || (route.props ? route.props.fallback : null) || null;

    if (Fallback) {

        if (!wrapFallbackWithComponent) {
            return <Fallback {...props} />;
        }

        return (
            <RouteComponent {...props}>
                <Fallback {...props} />
            </RouteComponent>
        );
    }

    return null;
};

internals.renderWithFallback.propTypes = {
    route: routeType,
    wrapFallbackWithComponent: T.bool
};
