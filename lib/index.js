'use strict';

const React = require('react');
const T = require('prop-types');
const { Switch, Route, Redirect } = require('react-router-dom');

const { cloneElement } = React;

const internals = {};

exports.Routes = function Routes(props) {

    let { routes } = props;
    const { onUpdate } = props;

    const {
        keyForRoute,
        renderRoute,
        cloneWithKeys,
        decorateRoutes
    } = internals;

    routes = decorateRoutes({
        basePath: '/',
        routes: [].concat(routes)
    });

    console.log('routes', routes);

    routes.forEach(({ childRoutes, ...route }) => {

        console.log('childRoutes', childRoutes);
        console.log('route', route);

        if (!childRoutes) {
            return;
        }

        childRoutes.forEach(({ childRoutes: grandChildRoutes }) => {

            console.log('grandChildRoutes', grandChildRoutes);
        });
    });

    const renderBase = renderRoute({ routes, basePath: '/', onUpdate });

    return (
        <Switch>
            {cloneWithKeys({
                items: routes.map(renderBase),
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

internals.decorateRoutes = ({ basePath = '/', fullPath = '/', routes }) => {

    if (!routes) {
        return null;
    }

    const {
        concatPaths,
        isFallbackRedirect,
        decorateRoutes,
        lastChild
    } = internals;

    // Ensure there is a root redirect
    // Setting this root fallback redirect ensures we can always rely
    // on lastChild(route.parentRoute.parentRoute.childRoutes) — which is the
    // last of grandparent's children, which is the route.parentRoute's last sibling —
    // to be a fallback redirect.
    if (routes.length > 0 && !isFallbackRedirect(lastChild(routes))) {
        // TODO make the defaultFallbackRedirectPath configurable
        routes.push({ redirect: { to: '/404' } });
    }

    return routes.map((route) => {

        route.basePath = basePath;
        route.fullPath = concatPaths(
            basePath,
            isFallbackRedirect(route) ? '/404' : route.path || ''
        );

        if (route.childRoutes) {
            // Tack on a redirect for the parent route's redirect if none exists for this one
            // Setup fallback redirects

            const childRoutes = [...route.childRoutes]
                .map((childRoute) => {

                    childRoute.parentRoute = route;
                    return childRoute;
                });

            // See if the last child in the list is a fallback redirect
            const fallbackRedirectSiblingExists = isFallbackRedirect(lastChild(routes));

            const grandparentRoute = route.parentRoute?.parentRoute;

            if (!fallbackRedirectSiblingExists && grandparentRoute) {
                if (isFallbackRedirect(lastChild(grandparentRoute.childRoutes))) {
                    console.log('PUSHING ONE');
                    console.log('{ ...lastChild(route.parentRoute.childRoutes) }', { ...lastChild(route.parentRoute.childRoutes) });
                    // childRoutes.push({ ...lastChild(grandparentRoute.childRoutes) });
                }
            }

            route.childRoutes = (
                decorateRoutes({
                    basePath: concatPaths(basePath, route.path),
                    routes: childRoutes
                })
            );
        }

        return route;
    });
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
        + !!route.exact
        + !!route.strict
        + !!route.sensitive
        + !!route.childRoutes
    );
};

internals.handleRedirect = function HandleRedirect(basePath, route) {

    const { concatPaths } = internals;

    // Redirect is special and must be exclusive of other props
    let { redirect: { from, to } } = route;

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
            RouteComponentLifecycleWrapper
        } = internals;

        if (!route) {
            return null;
        }

        const {
            path,
            exact,
            strict,
            sensitive,
            component: RouteComponent,
            wrapFallbackWithComponent
        } = route;

        if (!route) {
            return null;
        }

        const normalizedPath = concatPaths(basePath, path);
        const renderRouteFromPath = renderRoute({ routes, basePath: normalizedPath, onUpdate });

        return (
            <Route
                path={normalizedPath}
                exact={exact}
                strict={strict}
                sensitive={sensitive}
                render={(props) => {

                    if (route.redirect) {
                        return handleRedirect(basePath, route);
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

internals.lastChild = (arr) => arr[arr.length - 1];

internals.concatPaths = (base, path) => {

    base = base || '';
    path = path || '';

    base = base.endsWith('/') ? base.slice(0, -1) : base; // /my-path/ -> /my-path
    path = path.startsWith('/') ? path.slice(1) : path;   // /my-path -> my-path

    return `${base}/${path}`;
};
