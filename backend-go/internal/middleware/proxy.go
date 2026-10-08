package middleware

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

type IPResolver struct{ trusted []netip.Prefix }

func NewIPResolver(trusted []netip.Prefix) IPResolver {
	return IPResolver{trusted: append([]netip.Prefix(nil), trusted...)}
}
func (p IPResolver) isTrusted(ip netip.Addr) bool {
	for _, prefix := range p.trusted {
		if prefix.Contains(ip) {
			return true
		}
	}
	return false
}

func (p IPResolver) Resolve(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	peer = peer.Unmap()
	if !p.isTrusted(peer) {
		return peer.String()
	}
	if values := r.Header.Values("CF-Connecting-IP"); len(values) != 0 {
		if len(values) == 1 {
			if ip, err := netip.ParseAddr(strings.TrimSpace(values[0])); err == nil && ip.Zone() == "" {
				return ip.Unmap().String()
			}
		}
		return peer.String()
	}
	values := r.Header.Values("X-Forwarded-For")
	if len(values) == 0 {
		return peer.String()
	}
	parts := strings.Split(strings.Join(values, ","), ",")
	chain := make([]netip.Addr, len(parts))
	for i, part := range parts {
		ip, err := netip.ParseAddr(strings.TrimSpace(part))
		if err != nil || ip.Zone() != "" {
			return peer.String()
		}
		chain[i] = ip.Unmap()
	}
	// Walk from the trusted immediate peer; never select a spoofable leftmost IP
	// beyond the nearest untrusted hop.
	for i := len(chain) - 1; i >= 0; i-- {
		if !p.isTrusted(chain[i]) || i == 0 {
			return chain[i].String()
		}
	}
	return peer.String()
}

func (p IPResolver) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clientIPKey, p.Resolve(r))))
	})
}
