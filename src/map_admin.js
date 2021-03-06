
var $ = jQuery = require('jquery');
var _ = require('underscore'); 
var H = require('handlebars');

var config = require('./config');
var utils = require('./utils');

var Selector = require('leaflet-geojson-selector');

require('../node_modules/leaflet-geojson-selector/dist/leaflet-geojson-selector.min.css');

module.exports = {
	
	map: null,

	onInit: function(e){ console.log('onInit',e); },
	onSelect: function(e){ console.log('onSelect',e); },

	selectionLayer: null,

	selection: {
		country: null,
		region: null,
		province: null,
		municipality: null
	},

	config: {
		baseUrlGeojson: config.urls.baseUrlGeojson,
		selector: {
			zoomToLayer: true,
			listOnlyVisibleLayers: true,
			activeListFromLayer:true,
			activeLayerFromList:true,
			style: {
				color:'#00f',
				fillColor:'#08f',
				fillOpacity: 0.2,
				opacity: 0.6,
				weight: 1
			},
			activeStyle: {
				color:'#00f',
				fillColor:'#fc0',
				fillOpacity: 0.4,
				opacity: 0.6,
				weight: 1
			},
			selectStyle: {
				color:'#00f',
				fillColor:'#f80',
				fillOpacity: 0.4,
				opacity: 0.6,
				weight: 1
			}		
		}
	},

	//TODO
	/* getMarkerById(id) {
		return L.marker
	},*/

	init: function(el, opts) {

		var self = this;

		self.tmpls = {
			url_country: H.compile(this.config.baseUrlGeojson + 'regions.json'),
			url_region: H.compile(this.config.baseUrlGeojson + 'regions.json'),
			url_province: H.compile(this.config.baseUrlGeojson + '{{region.properties.id}}/provinces.json'),
			url_municipality: H.compile(this.config.baseUrlGeojson + '{{region.properties.id}}/{{province.properties.id}}/municipalities.json'),
			//TODO FIXME municipalities
			bread_admin: H.compile($('#tmpl_bread_admin').html()),
		};
		
		self.$breadcrumb = $('#breadcrumb');

		self.onInit = opts && opts.onInit,
		self.onSelect = opts && opts.onSelect,
		
		self.mapOpts = utils.getMapOpts({
			scrollWheelZoom: false,
			minZoom: 5
		});

        L.Icon.Default.imagePath = location.href.split('/').slice(0,-1).join('/')+'/images/';

		self.map = L.map(el, self.mapOpts)
			.on('popupopen', function(e) {
			    var p = self.map.project(e.popup._latlng);
			    p.y -= e.popup._container.clientHeight/2;
			    p.x -= self.controlSelect._container.clientWidth - e.popup._container.clientWidth/2;
			    self.map.panTo(self.map.unproject(p),{animate: true});
			})
			.addControl(L.control.zoom({ position:'topright' }));

		self.selectionLayer = L.geoJson(null, {
			onEachFeature: function(f,l) {
				l.bindTooltip(f.properties.name, {sticky: true, direction:'top'});
			}
		}).addTo(self.map);

		self.loadGeojson(function(json) {
			
			//NASTY PATCH for country level..
			self.selection.country = L.extend({},json);
			self.selection.country.properties = { id:1, name: "Italia"};
			self.selection.country.features = [json.features]

			self.selectionLayer.addData(json);

			self.map.fitBounds(self.selectionLayer.getBounds());

			self.controlSelect = new Selector(self.selectionLayer, self.config.selector)
				.on('selector:change', function(e) {
					L.DomEvent.stop(e);
					
					if(e.selected) {
						self.update( L.featureGroup(e.layers).toGeoJSON() );
					}
				}).addTo(self.map);
		});

		self.$breadcrumb
			.html(self.tmpls.bread_admin(self.selection))
			.on('click','a', function(e) {
				var sel = $(e.target).data();

				if(sel.municipality) {
					self.update( L.geoJson([self.selection.municipality]).toGeoJSON() )
				}
				else if(sel.province) {
					self.selection.municipality = null;
					self.update( L.geoJson([self.selection.province]).toGeoJSON() )
				}
				else if(sel.region) {
					self.selection.municipality = null;
					self.selection.province = null;
					self.update( L.geoJson([self.selection.region]).toGeoJSON() )
				}
				else if(sel.country) {
					self.selection.municipality = null;
					self.selection.province = null;
					self.selection.region = null;
					self.update( L.geoJson(self.selection.country.features).toGeoJSON() );
					//NASTY PATCH for country level..
					self.map.fitBounds(L.geoJson(self.selection.country.features[0]).getBounds());
				}
			});

		//todo run self.onInit()

		return this;
	},


	getTitle: function(selection) {

		if( selection && 
			selection.municipality && 
			selection.municipality.properties.name )
			return 'Comune di '+ selection.municipality.properties.name;
		else
			return '';
	},

	update: function(selectedGeo) {

		var self = this,
			selectedProps;

		if(selectedGeo.features[0] && selectedGeo.features[0].properties)
		{
			selectedProps = selectedGeo.features[0].properties;

			//is a municipality level
			if(selectedProps.id_prov) {
				
				self.selection = _.extend(self.selection, {
					municipality: selectedGeo.features[0]
				});
			}
			//is a province level
			else if(selectedProps.id_reg) {

				self.selection = _.extend(self.selection, {
					province: selectedGeo.features[0]
				});
			}
			else {
				self.selection = _.extend(self.selection, {
					region: selectedGeo.features[0]
				});						
			}
			
			self.map.fitBounds(L.geoJson(selectedGeo).getBounds());
		}

		selectedGeo.properties = {
			title: self.getTitle(self.selection)
		};

		if(self.selection.municipality)
		{
			self.onSelect.call(self, selectedGeo);
		}
		else
		{
			self.loadGeojson(function(json) {

				self.selectionLayer.clearLayers().addData(json);
				self.controlSelect.reload(self.selectionLayer);

				if(selectedGeo.features[0]) {
					if( 
						//selectedGeo.features[0].properties.id_reg || //provincia 
						selectedGeo.features[0].properties.id_prov 	//comune
					)
						self.onSelect.call(self, selectedGeo);
				}
			});
		}

		self.$breadcrumb.html( self.tmpls.bread_admin(self.selection) );
	},

	getGeoUrl: function(sel) {

		if(sel.region && sel.province)
			return this.tmpls.url_municipality(sel);
		
		else if(sel.region && !sel.province)
			return this.tmpls.url_province(sel);

		else if(sel.country && !sel.region)
			return this.tmpls.url_region(sel);

		else// if(!sel.country)
			return this.tmpls.url_country(sel);
	},

  	loadGeojson: function(cb) {
  		
  		var url = this.getGeoUrl(this.selection);

		return utils.getData(url, cb);
  	}	
};
