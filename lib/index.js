'use strict';

const React = require('react');
const T = require('prop-types');
const { Switch, Route, Redirect } = require('react-router-dom');

const { cloneElement } = React;

const internals = {};

exports.Routes = function Routes(props) {

    const { routes, onUpdate, defaultRedirect, debug } = props;

    const {
        keyForRoute,
        renderRoute,
        cloneWithKeys,
        markParents,
        decorateRoutes,
        logRouteConfig
    } = internals;

    const routesWithMarkedParents = markParents([].concat(routes));

    const decoratedRoutes = decorateRoutes({
        basePath: '/',
        routes: routesWithMarkedParents,
        defaultRedirect
    });

    if (debug) {
        logRouteConfig(decoratedRoutes);
    }

    if (!decoratedRoutes) {
        return null;
    }

    const renderBase = renderRoute({ routes: decoratedRoutes, basePath: '/', onUpdate });

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

internals.markParents = (routes) => {

    return routes.map((route) => {

        if (route.childRoutes) {
            route.childRoutes = internals.markParents(
                route.childRoutes.map((childRoute) => ({
                    ...childRoute,
                    parentRoute: route
                }))
            );
        }

        return route;
    });
};

internals.decorateRoutes = ({ routes, basePath = '/', defaultRedirect = '/404' }) => {

    if (!routes || !Array.isArray(routes) || routes.length === 0) {
        return null;
    }

    const {
        concatPaths,
        decorateRoutes,
        isFallbackRedirect,
        lastChild,
        cleanupMultiline
    } = internals;

    // Setup fallback redirects
    if (!isFallbackRedirect(lastChild(routes))) {
        routes.push({
            redirect: {
                // The secret sauce
                to: lastChild(routes[0].parentRoute?.parentRoute?.childRoutes)?.redirect?.to || defaultRedirect
            }
        });
    }

    routes = routes.map((route) => {

        route.basePath = basePath;
        route.fullPath = concatPaths(
            basePath,
            isFallbackRedirect(route) ? defaultRedirect : route.path || ''
        );

        // StrangeRouter automatically manages setting "exact" for routes based on configuration.
        if (route.childRoutes) {
            route.exact = false;
        }

        // There are special considerations for routes with path '/'.

        // Set exact: true for routes that have path '/'.
        // These routes should only be used for rendering at the parent route's exact path or at root '/'.
        // This also ensures other routes don't get 'hidden' by path '/' stealing the route match in <Switch>.
        if (route.path === '/') {
            route.exact = true;
        }

        if (route.childRoutes) {
            route.childRoutes = (
                decorateRoutes({
                    basePath: concatPaths(basePath, route.path),
                    routes: route.childRoutes
                })
            );
        }

        return route;
    });

    // *** Post-decoration mutations ***

    // Here's an example configuration we will rearrange:

    // Bad:
    // routes = [{
    //     path: '/root',
    //     ...,
    //     childRoutes: [
    //         {
    //             path: '/',
    //             ...,
    //             childRoutes: [{ path: '/sub', ... }]
    //         },
    //         { path: '/other', ... }
    //     ]
    // }]

    // Bad will turn into Good:
    // routes = [{
    //     path: '/root',
    //     ...,
    //     childRoutes: [
    //         { path: '/', ... },
    //         { path: '/sub', ... },
    //         { path: '/other', ... }
    //     ]
    // }]

    // The Bad configuration leads to bugs and funkiness.
    // '/other' will be ignored in the bad example because it comes after
    // the '/' route, which matches first and renders in the <Switch>.

    // If we encounter this, we will alter the configuration next and display a console warning.

    // TODO take another look at this

    const badRootPathConfig = routes.find((route) => route.path === '/' && route.childRoutes);

    if (badRootPathConfig) {
        console.warn(cleanupMultiline(`
            StrangeRouter: Warning: at path: "${badRootPathConfig.fullPath}".
            Invalid configuration: Cannot configure a route with path '/' to have child routes.
            StrangeRouter will update these child routes to be siblings automatically. Please consider the following:
            1) If you want to have a wrapper for this path's children, move the wrapper code up to the parent component.
            2) Otherwise, having child routes under '/' is the same as having sibling routes for '/'.
        `));

        const { childRoutes: newSiblings, ...rootPathRoute } = badRootPathConfig;

        routes = [
            rootPathRoute,
            // Add new siblings, remove any fallbacks
            ...newSiblings.filter((route) => !isFallbackRedirect(route)),
            ...routes.filter((route) => route.path !== '/')
        ];
    }

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
        to = to.startsWith('/') ? to : concatPaths(basePath, to);
    }
    else if (to && typeof to.pathname === 'string') {
        // to is an object
        to = {
            ...to,
            pathname: to.pathname.startsWith('/') ? to.pathname : concatPaths(basePath, to.pathname)
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
            keyForRoute,
            cloneWithKeys,
            RouteComponentLifecycleWrapper,
            sliceOffLastRouteFromPath,
            lastChild,
            findMatchingChildPath,
            findClosestMatchingChildPath
        } = internals;

        if (!route) {
            return null;
        }

        const {
            path,
            fullPath,
            exact, // Automatically managed by StrangeRouter
            strict,
            sensitive,
            component: RouteComponent,
            wrapFallbackWithComponent,
            parentRoute
        } = route;

        if (!route) {
            return null;
        }

        const normalizedPath = concatPaths(basePath, path);

        const renderRouteFromPath = renderRoute({
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
                            // Thanks to 'internals.decorateRoutes', we know the last child of
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
                        ...route.props,
                        route
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
                                        {cloneWithKeys({
                                            // 'childRoutes' mapped to 'renderRouteFromPath' — It's a recursion excursion! =P
                                            items: [].concat(route.childRoutes).map(renderRouteFromPath),
                                            keyGetter: (routeEl) => normalizedPath + keyForRoute(routeEl.props)
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

    let isMounted = false;
    useEffect(() => {

        isMounted = true;

        return () => {

            isMounted = false;
        };
    }, [isMounted]);

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

            if (!isMounted) {
                return null;
            }

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

internals.lastChild = (arr) => {

    if (!arr) {
        return;
    }

    return arr[arr.length - 1];
};

internals.sliceOffLastRouteFromPath = (str) => str.split('/').slice(0, str.split('/').length - 1).join('/');

internals.concatPaths = (base, path) => {

    base = base || '';
    path = path || '';

    base = base.endsWith('/') ? base.slice(0, -1) : base; // /my-path/ -> /my-path
    path = path.startsWith('/') ? path.slice(1) : path;   // /my-path -> my-path

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

    if (!matchPath.startsWith(route.fullPath) || route.path === '/') {
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
